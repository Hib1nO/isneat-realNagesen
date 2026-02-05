import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import { Server } from "socket.io";

import { loadBaseConfig, buildRuntimeConfig } from "./config.js";
import { createInitialState, resetMatch, getPublicState } from "./state.js";
import { startTick } from "./tick.js";
import { startTimerLoop, handleTimerStart, handleTimerPauseToggle } from "./timer.js";
import { createSCController } from "./sc.js";
import { createDb } from "./db.js";
import { createApiRouter } from "./routes/api.js";
import { getLocalIPv4List } from "./ipget.js";


const address = getLocalIPv4List()[0].address;
// ------------------------------
// 1) baseConfig は config.json から（最小項目のみ）
// ------------------------------
const baseConfig = loadBaseConfig();

// ------------------------------
// 2) DB 初期化（baseConfig に db.dir 等がある）
// ------------------------------
const db = createDb(baseConfig);

// ------------------------------
// 3) settings を DB から読み込み（無ければ初期値を作る）
//    ※ timer/gifts 等は settings 側で管理
// ------------------------------
const DEFAULT_SETTINGS = {
  timer: { defaultSeconds: 360 },
  gifts: {
    // 初期例（不要なら空でもOK）
    Gift01: { unitScore: 10, effectVideos: [] },
    Gift02: { unitScore: 30, effectVideos: [] },
    Gift03: { unitScore: 100, effectVideos: [] },
    Gift04: { unitScore: 300, effectVideos: [] }
  },
  sc: {
    noticeSeconds: 30,
    // intervalSeconds: 120,
    missionSeconds: 60,
    // sctimerSeconds: 60,
    bonusSeconds: 60,
    autoStart: true,
    autoStartTime: 240,
    scMagnification: 3
  },
  lastBonusMagnification: 5,
  matchformat: 1,
  matchplayers: {
    player01: {
      id: null,
      PlayerName: "",
      PlayerImg: null
    },
    player02: {
      id: null,
      PlayerName: "",
      PlayerImg: null
    },
    player03: {
      id: null,
      PlayerName: "",
      PlayerImg: null
    },
    player04: {
      id: null,
      PlayerName: "",
      PlayerImg: null
    },
  },
};

let settings = null;
if (db.enabled) {
  settings = await db.getSettings();
  if (!settings) {
    settings = await db.enqueue(() => db.setSettings(DEFAULT_SETTINGS));
    console.log("[db] settings was empty -> seeded DEFAULT_SETTINGS");
  }
}

// ------------------------------
// 4) runtimeConfig = baseConfig + settings(DB)
// ------------------------------
const config = buildRuntimeConfig(baseConfig, settings, address);
console.log("config");
console.log(config);

// state は gifts/timer を使うので runtimeConfig で初期化
const state = createInitialState(config);
console.log("state");
console.log(state);

const app = express();
app.use(cors({ origin: config.corsOrigin ?? "*" }));

// Pug setup
app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "pug");

// (optional) static assets folder
app.use("/assets", express.static("public"));

app.get("/", (req, res) => res.redirect("/admin"));
app.get("/admin", (req, res) => res.render("testhtml", {
  title: "Admin",
  ip: config.address,
  port: config.port
}));
app.get("/hud", (req, res) => res.render("hud", { title: "HUD" }));
app.get("/hud02", (req, res) => res.render("battle-bar", { title: "battle-bar" }));
app.get("/input", (req, res) => res.render("input", { title: "Input" }));

app.use("/api", createApiRouter({ state, config, db }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigin ?? "*" }
});

// namespaces
const ioAdmin = io.of("/admin");
const ioHud = io.of("/hud");
const ioInput = io.of("/input");

// speed challenge controller
const sc = createSCController({ ioAdmin, ioHud, state });

// ------------------------------
// Match result finalize helpers
// ------------------------------
function calcMatchOutcome({ score01, score02 }) {
  if (score01 > score02) return { outcome: "player01_win", winner: "player01", loser: "player02" };
  if (score02 > score01) return { outcome: "player02_win", winner: "player02", loser: "player01" };
  return { outcome: "draw", winner: null, loser: null };
}

function isAnyTimerMoving(state) {
  // 「ポーズ中」は結果確定OK
  if (state.timerPause) return false;

  // match timer
  if (state.timerProcessing) return true;

  // speed challenge timers
  const scState = state.sc ?? {};
  if (scState.process) return true;
  if (scState.noticeProcess || scState.missionProcess) return true;
  if (scState.player01BonusProcess || scState.player02BonusProcess) return true;

  return false;
}

function emitMatchResult(payload) {
  // HUDへ送信（互換のため2イベント投げます）
  ioHud.emit("match:result", payload);
  ioHud.emit("result:show", payload);

  // 管理画面にも通知（必要なら表示に使える）
  ioAdmin.emit("match:result", payload);
}

async function finalizeMatchAndSendResult({ reason = "manual" } = {}) {
  try {
    // タイマーが動作中なら弾く（ただしポーズ中はOK）
    if (isAnyTimerMoving(state)) {
      ioAdmin.emit("notify", {
        type: "warn",
        message: "タイマー稼働中は結果確定できません。ポーズしてから実行してください。"
      });
      return;
    }

    // 既に終了済みなら、最後の結果を再送だけする（DB二重保存防止）
    if (!state.matchProcess && state._lastMatchResult) {
      emitMatchResult(state._lastMatchResult);
      ioAdmin.emit("notify", { type: "info", message: "Result re-sent." });
      return;
    }

    if (!state.matchProcess) {
      ioAdmin.emit("notify", { type: "warn", message: "Match is not started." });
      return;
    }

    const score = {
      player01: Number(state.total?.player01 ?? 0),
      player02: Number(state.total?.player02 ?? 0)
    };
    const { outcome, winner, loser } = calcMatchOutcome({
      score01: score.player01,
      score02: score.player02
    });

    const endedAt = Date.now();

    // 先に試合を止める（以降の加点を止める）
    state.matchProcess = false;
    state.timerProcessing = false;
    // ポーズ状態は維持（ポーズして確定する運用があるため）
    // state.timerPause は触らない

    // SCが走っていたら安全に停止（倍率の復元など）
    try {
      sc?.stop?.();
    } catch (e) {
      console.warn("[match] sc.stop failed", e);
    }

    const payload = {
      reason,
      outcome,
      winner,
      loser,
      score,
      matchsettings: {
        matchformat: state.matchFormat,
        matchplayers: state.matchplayers
      },
      endedAt,
      matchId: null
    };

    // DB保存（db.enabled=falseならスキップ）
    if (db.enabled && db.createMatch) {
      try {
        const saved = await db.enqueue(() =>
          db.createMatch({
            total: { ...score },
            matchformat: state.matchFormat,
            matchplayers: JSON.parse(JSON.stringify(state.matchplayers || {})),
            matchstate: "終了",
            outcome,
            winner,
            loser,
            timerCount: state.timerCount,
            endedAt
          })
        );
        payload.matchId = saved?.matchId ?? null;
      } catch (e) {
        console.error("[match] save ended match failed", e);
        ioAdmin.emit("notify", {
          type: "error",
          message: "DB保存に失敗しました（ログを確認してください）"
        });
      }
    }

    // 最後の結果を保持（再表示用）
    state._lastMatchResult = payload;

    // 結果送信
    emitMatchResult(payload);

    // 画面側の状態も即時更新
    ioAdmin.emit("state:update", getPublicState(state));
    ioHud.emit("state:update", getPublicState(state));

    ioAdmin.emit("notify", {
      type: "info",
      message: payload.matchId ? `Result sent & saved. matchId=${payload.matchId}` : "Result sent."
    });
  } catch (e) {
    console.error("[match] finalize error", e);
    ioAdmin.emit("notify", { type: "error", message: "結果処理でエラーが発生しました（ログを確認してください）" });
  }
}

// /input: receives snapshot every 250ms (latest-wins)
ioInput.on("connection", (socket) => {
  socket.on("snapshot", (payload) => {
    state.latestSnapshot = payload; // keep it light
  });
});

// /admin: receives triggers
ioAdmin.on("connection", (socket) => {
  socket.emit("state:init", getPublicState(state));

  socket.on("timer:start", () => {
    var seconds = config.timer.defaultSeconds
    handleTimerStart({ ioAdmin, ioHud, state, seconds });
  });

  socket.on("timer:pauseToggle", () => {
    handleTimerPauseToggle({ ioAdmin, ioHud, state });
  });

  // ★ 結果表示トリガ（admin側からemitして使う）
  // 互換のため複数名で受け付け
  socket.on("result:show", () => finalizeMatchAndSendResult({ reason: "result:show" }));
  socket.on("match:finish", () => finalizeMatchAndSendResult({ reason: "match:finish" }));
  socket.on("match:showResult", () => finalizeMatchAndSendResult({ reason: "match:showResult" }));


  socket.on("match:reset", async () => {
    // ★ matchesに1試合ごとにID採番して保存
      const saved = await db.enqueue(() => {
        if (!state.matchProcess) return null;
        return db.createMatch({
          total: { ...state.total },
          matchformat: state.matchFormat,
          matchplayers: JSON.parse(JSON.stringify(state.matchplayers || {})),
          matchstate: "キャンセル",
          timerCount: state.timerCount,
          endedAt: Date.now()
        });
      });

      if (saved) {
        ioAdmin.emit("notify", {
          type: "info",
          message: saved?.matchId ? `Saved match result. matchId=${saved.matchId}` : "Saved match result."
        });
      }

    resetMatch(state, config);
    state._lastMatchResult = null;
    ioAdmin.emit("state:init", getPublicState(state));
    ioHud.emit("state:init", getPublicState(state));
  });

  socket.on("score:reset", () => {
    state.total.player01 = 0;
    state.total.player02 = 0;
  });

  socket.on("score:adjust", ({ player, delta }) => {
    if (player !== "player01" && player !== "player02") return;
    state.total[player] += Number(delta ?? 0);
  });

  socket.on("score:setMagnification", ({ player, magnification }) => {
    if (!state.matchProcess) return;
    if (player !== "player01" && player !== "player02") return;
    const m = Number(magnification);
    if (!Number.isFinite(m) || m <= 0) return;
    state.magnification[player] = m;
  });

  socket.on("lastbonus:start", ({player}) => {
    if (player !== "player01" && player !== "player02") return;
    const m = Number(config.lastBonusMagnification)
    console.log(!Number.isFinite(m) || m <= 0);
    if (!Number.isFinite(m) || m <= 0) return;
    state.lastBounsProcess[player] = true;
    state.magnification[player] = config.lastBonusMagnification;
  })

  socket.on("lastbonus:end", ({player}) => {
    if (player !== "player01" && player !== "player02") return;
    state.lastBounsProcess[player] = false;
    state.magnification[player] = 1;
  })

  socket.on("sc:start", () => {
    if (!config.sc.autoStart) {
      sc.start({
        noticeSec: Number(config.sc.noticeSeconds ?? 30),
        missionSec: Number(config.sc.missionSeconds ?? 60),
        bonusSec: Number(config.sc.bonusSeconds ?? 60),
        magnification: Number(config.sc.scMagnification ?? 2)
      });
    }
  });

  socket.on("sc:success", ({ player }) => {
    sc.markSuccess(player);
  });
});

// /hud: send current state on connect
ioHud.on("connection", (socket) => {
  socket.emit("state:init", getPublicState(state));
});

// loops
startTick({ ioAdmin, ioHud, state, config });
startTimerLoop({ ioAdmin, ioHud, state, config, sc });

server.listen(config.port ?? 8088, () => {
  console.log(`[server] listening on http://localhost:${config.port ?? 8088}`);
  console.log(`[pages] /admin /hud /input`);
});
