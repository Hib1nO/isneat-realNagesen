import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

function dbGuard(db, res) {
  if (!db?.enabled) {
    res.status(503).json({ ok: false, message: "db is disabled (config.db.enabled=false)" });
    return false;
  }
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    // 画像のみ許可
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

const STRAGE_DIR = path.join(process.cwd(), "public", "strage");

function extFromMimetype(mimetype) {
  // 必要に応じて追加
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };
  return map[mimetype] || ".bin";
}

async function savePlayerImage({ playerId, file }) {
  await fs.mkdir(STRAGE_DIR, { recursive: true });

  const ext = extFromMimetype(file.mimetype);
  const filename = `${playerId}${ext}`;
  const filepath = path.join(STRAGE_DIR, filename);

  await fs.writeFile(filepath, file.buffer);

  // あなたのサーバでは app.use("/assets", express.static("public")) なので
  // 公開URLは /assets/strage/<filename> が自然
  return `/assets/strage/${filename}`;
}

// playerId の画像（拡張子違いが残ってても削除できるようにする）
async function removePlayerImages(playerId) {
  try {
    const files = await fs.readdir(STRAGE_DIR);
    const targets = files.filter((f) => f.startsWith(playerId + "."));
    await Promise.all(targets.map((f) => fs.unlink(path.join(STRAGE_DIR, f)).catch(() => {})));
  } catch {
    // フォルダが無い/権限などは無視（削除の本体を邪魔しない）
  }
}

function applySettingsToRuntime({ config, state, settings }) {
  if (!settings || typeof settings !== "object") return;

  // 反映対象（必要に応じて増やせます）
  if (settings.timer) config.timer = settings.timer;
  if (settings.gifts) config.gifts = settings.gifts;

  // gifts のキー一覧を再生成
  config.giftKeys = Object.keys(config.gifts || {});

  // lastSnapshot を giftKeys に合わせて作り直す（既存値は引き継ぐ）
  for (const player of ["player01", "player02"]) {
    const prev = state.lastSnapshot?.[player] || {};
    const next = {};
    for (const k of config.giftKeys) next[k] = Number(prev[k] ?? 0);
    state.lastSnapshot[player] = next;
  }
  const def = Number(config.timer?.defaultSeconds);
  if (Number.isFinite(def) && def >= 0) state.timerCount = def;
  if (settings.sc !== undefined) config.sc = settings.sc;
}

function applyMatchSettingsToRuntime({ config, state, settings }) {
  if (!settings || typeof settings !== "object") return;

  // 反映対象（必要に応じて増やせます）
  if (settings.matchformat) {
    config.matchformat = settings.matchformat;
    state.matchformat = settings.matchformat;
  }

  if (settings.matchplayers !== undefined) {
    config.matchplayers = settings.matchplayers;
    state.matchplayers = settings.matchplayers;
  }
}

export function createApiRouter({ state, config, db }) {
  const router = express.Router();

  // GET /api/player/player01/gift/Gift01
  router.get("/player/:player/gift/:giftKey", (req, res) => {
    const player = req.params.player;
    const giftKey = req.params.giftKey;

    if (!state.matchProcess) return res.status(409).json({ ok: false, message: "match not started" });
    if (!config.gifts[giftKey]) return res.status(400).json({ ok: false, message: "unknown giftKey" });
    if (player !== "player01" && player !== "player02") return res.status(400).json({ ok: false, message: "unknown player" });

    // For demo: bump baseline by +1 (keeps diff logic consistent)
    state.lastSnapshot[player][giftKey] = Number(state.lastSnapshot[player][giftKey] ?? 0) + 1;

    res.json({ ok: true });
  });

  // POST /api/player/player01/gift  { Gift01: 3, Gift02: 1 }
  router.post("/player/:player/gift", express.json(), (req, res) => {
    const player = req.params.player;
    if (player !== "player01" && player !== "player02") return res.status(400).json({ ok: false });

    const body = req.body || {};
    for (const giftKey of config.giftKeys) {
      const add = Number(body[giftKey] ?? 0);
      if (add > 0) {
        state.lastSnapshot[player][giftKey] = Number(state.lastSnapshot[player][giftKey] ?? 0) + add;
      }
    }
    res.json({ ok: true });
  });

  // =========================
  // ★ DB Read/Write APIs
  // =========================

  // --- matches ---
  router.get("/matches", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const limit = Number(req.query.limit ?? 50);
    const skip = Number(req.query.skip ?? 0);
    const items = await db.listMatches({ limit, skip });
    res.json({ ok: true, items });
  });

  router.get("/matches/:matchId", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const item = await db.getMatchById(req.params.matchId);
    if (!item) return res.status(404).json({ ok: false, message: "not found" });
    res.json({ ok: true, item });
  });

  // --- players ---
  router.get("/players", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const limit = Number(req.query.limit ?? 200);
    const skip = Number(req.query.skip ?? 0);
    const items = await db.listPlayers({ limit, skip });
    res.json({ ok: true, items });
  });

  router.get("/players/:playerId", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const item = await db.getPlayerById(req.params.playerId);
    if (!item) return res.status(404).json({ ok: false, message: "not found" });
    res.json({ ok: true, item });
  });

  router.post("/players", upload.single("image"), async (req, res) => {
    if (!dbGuard(db, res)) return;

    if (!req.body.name) return res.status(404).json({ ok: false, message: "名前を入力してください。"})

    const { name = "", key = null } = req.body || {};
    const file = req.file; // 画像（任意）

    // 1) 先にプレイヤー作成（playerId採番）
    const created = await db.enqueue(() => db.createPlayer({ name, key, imageUrl: "" }));

    // 2) 画像があれば public/strage に保存して imageUrl 更新
    if (file) {
      const imageUrl = await savePlayerImage({ playerId: created.playerId, file });
      const updated = await db.enqueue(() => db.updatePlayer(created.playerId, { imageUrl }));
      return res.status(201).json({ ok: true, item: updated });
    }

    res.status(201).json({ ok: true, item: created });
  });

  router.put("/players/:playerId", upload.single("image"), async (req, res) => {
    if (!dbGuard(db, res)) return;

    const playerId = req.params.playerId;
    const file = req.file;

    // 1) まずプレイヤーが存在するか確認（任意だがあると親切）
    const exists = await db.getPlayerById(playerId);
    if (!exists) return res.status(404).json({ ok: false, message: "player not found" });

    // 2) 画像があれば保存して imageUrl を patch に入れる
    const patch = { ...(req.body || {}) };

    if (file) {
      const imageUrl = await savePlayerImage({ playerId, file });
      patch.imageUrl = imageUrl;
    }

    // 3) 更新
    const updated = await db.enqueue(() => db.updatePlayer(playerId, patch));
    res.json({ ok: true, item: updated });
  });

  router.delete("/players/:playerId", async (req, res) => {
    if (!dbGuard(db, res)) return;

    const playerId = req.params.playerId;

    // DBから削除（db.deletePlayer を実装してください）
    const removed = await db.enqueue(() => db.deletePlayer(playerId));
    if (!removed) return res.status(404).json({ ok: false, message: "player not found" });

    // 画像ファイルも削除（任意だが強くおすすめ）
    await removePlayerImages(playerId);

    res.json({ ok: true });
  });


  // --- settings ---
  router.get("/settings", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const settings = await db.getSettings();
    res.json({ ok: true, settings });
  });

  router.put("/settings", express.json(), async (req, res) => {
    
    if (!state.timerProcessing && !state.matchProcess) return res.status(503).json({ ok: false, message: "試合を終了してから保存してください。" });
    try {
      applySettingsToRuntime({ config, state, settings: saved });
    } catch (error) {
      console.log(error)
      return res.status(503).json({ ok: false, message: "保存に失敗しました"})
    }

    if (!dbGuard(db, res)) return res.status(201).json({ ok: true, message: "データ保存を利用していません。" });
    const saved = await db.enqueue(() => db.setSettings(req.body || {}));

    res.json({ ok: true, settings: saved });
  });

  router.put("/matchsettings", express.json(), async (req, res) => {
    const body = (req.body && req.body.settings) ? req.body.settings : (req.body || {});
    const patch = {
      matchformat: body.matchformat,
      matchplayers: body.matchplayers
    };

    // 先にランタイムへ反映（DB無効でも反映）
    try {
      applyMatchSettingsToRuntime({ config, state, settings: patch });
    } catch (error) {
      console.log(error);
      return res.status(503).json({ ok: false, message: "保存に失敗しました" });
    }

    // DB無効ならここで終了（ランタイム反映済み）
    if (!dbGuard(db, res)) return res.status(201).json({ ok: true, message: "データ保存を利用していません。" });

    // 既存 settings に match 系のみマージして保存
    const current = await db.getSettings();
    const merged = { ...(current || {}) };
    if (patch.matchformat !== undefined) merged.matchformat = patch.matchformat;
    if (patch.matchplayers !== undefined) merged.matchplayers = patch.matchplayers;

    const saved = await db.enqueue(() => db.setSettings(merged));
    res.json({ ok: true, settings: saved });
  });

  return router;
}
