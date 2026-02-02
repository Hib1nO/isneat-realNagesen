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

// /input: receives snapshot every 250ms (latest-wins)
ioInput.on("connection", (socket) => {
  socket.on("snapshot", (payload) => {
    state.latestSnapshot = payload; // keep it light
  });
});

// /admin: receives triggers
ioAdmin.on("connection", (socket) => {
  socket.emit("state:init", getPublicState(state));

  socket.on("timer:start", ({}) => {
    var seconds = config.timer.defaultSeconds
    handleTimerStart({ ioAdmin, ioHud, state, seconds });
  });

  socket.on("timer:pauseToggle", () => {
    handleTimerPauseToggle({ ioAdmin, ioHud, state });
  });

  socket.on("match:reset", async () => {
    // ★ matchesに1試合ごとにID採番して保存
    if (db.enabled && db.createMatch) {
      const saved = await db.enqueue(() =>
        db.createMatch({
          total: { ...state.total },
          timerCount: state.timerCount,
          endedAt: Date.now()
        })
      );
      ioAdmin.emit("notify", {
        type: "info",
        message: saved?.matchId ? `Saved match result. matchId=${saved.matchId}` : "Saved match result."
      });
    }

    resetMatch(state, config);
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
    if (player !== "player01" && player !== "player02") return;
    const m = Number(magnification);
    if (!Number.isFinite(m) || m <= 0) return;
    state.magnification[player] = m;
  });

  socket.on("sc:start", () => {
    if(!config.sc.autoStart){
      sc.start({
        intervalSec: Number(config.sc.missionSeconds ?? 10),
        mainSec: Number(config.sc.bonusSeconds ?? 10),
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
