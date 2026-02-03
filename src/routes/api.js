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

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    // 動画のみ許可
    if (!file.mimetype?.startsWith("video/")) {
      return cb(new Error("Only video files are allowed"));
    }
    cb(null, true);
  }
});

const STRAGE_DIR = path.join(process.cwd(), "public", "strage");
const VIDEO_DIR = path.join(process.cwd(), "public", "video");

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

function extFromVideoMimetype(mimetype) {
  const map = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };
  return map[mimetype] || ".mp4";
}

async function saveGiftVideo({ giftId, file }) {
  await fs.mkdir(VIDEO_DIR, { recursive: true });

  const ext = extFromVideoMimetype(file.mimetype);
  const filename = `${giftId}${ext}`;
  const filepath = path.join(VIDEO_DIR, filename);

  await fs.writeFile(filepath, file.buffer);

  // public/video は /assets/video/<filename> で配信される
  return `/assets/video/${filename}`;
}

async function removeGiftVideoFiles(giftId) {
  // 拡張子違いが残っても消せるようにする
  try {
    const files = await fs.readdir(VIDEO_DIR);
    const targets = files.filter((f) => f.startsWith(giftId + "."));
    await Promise.all(targets.map((f) => fs.unlink(path.join(VIDEO_DIR, f)).catch(() => {})));
  } catch {
    // ignore
  }
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
  if (settings.lastBonusMagnification !== undefined) {
    config.lastBonusMagnification = settings.lastBonusMagnification;
    state.lastBonusMagnification = settings.lastBonusMagnification;
  }
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

 


  // --- settings ---
  router.put(
    "/settings",
    (req, res, next) => {
      const ct = String(req.headers["content-type"] || "");
      if (ct.includes("multipart/form-data")) return uploadVideo.any()(req, res, next);
      return express.json()(req, res, next);
    },
    async (req, res) => {
      // 試合中の保存は不可（現状メッセージに合わせる）
      if (state.timerProcessing || state.matchProcess) {
        return res.status(409).json({ ok: false, message: "試合を終了してから保存してください。" });
      }

      // settings 本体（json or multipart: body.settings）
      let incoming = {};
      try {
        if (req.body?.settings) incoming = JSON.parse(req.body.settings);
        else incoming = req.body || {};
      } catch (e) {
        console.error("[api/settings] settings parse failed", e);
        return res.status(400).json({ ok: false, message: "settings の形式が不正です" });
      }

      // 前回設定（動画削除判定に使う）
      const prevSettings = db?.enabled ? await db.getSettings() : null;

      // 動画ファイル（fieldname: giftVideo_<GiftId>）
      const files = Array.isArray(req.files) ? req.files : [];
      const uploadedGiftIds = new Set();

      for (const f of files) {
        const field = String(f.fieldname || "");
        if (!field.startsWith("giftVideo_")) continue;
        const giftId = field.replace("giftVideo_", "").trim();
        if (!giftId) continue;

        uploadedGiftIds.add(giftId);

        // 既存のギフト動画は一旦削除して上書き
        await removeGiftVideoFiles(giftId);

        const url = await saveGiftVideo({ giftId, file: f });

        if (!incoming.gifts) incoming.gifts = {};
        if (!incoming.gifts[giftId]) incoming.gifts[giftId] = { unitScore: 0, effectVideos: [] };
        incoming.gifts[giftId].effectVideos = [url];
      }

      // 「動画削除（effectVideos=[]）」が指定されたギフトは、前回動画も消す
      try {
        const prevGifts = prevSettings?.gifts || {};
        const nextGifts = incoming?.gifts || {};
        for (const giftId of Object.keys(nextGifts)) {
          const prevVideos = prevGifts[giftId]?.effectVideos || [];
          const nextVideos = nextGifts[giftId]?.effectVideos || [];

          const wantsDelete = Array.isArray(nextVideos) && nextVideos.length === 0;
          if (wantsDelete && prevVideos.length > 0 && !uploadedGiftIds.has(giftId)) {
            await removeGiftVideoFiles(giftId);
          }
        }
      } catch (e) {
        console.warn("[api/settings] video delete cleanup failed", e);
      }

      // DB保存
      let saved = incoming;
      if (!dbGuard(db, res)) {
        // DB無効でも runtime 反映は行う
        try {
          applySettingsToRuntime({ config, state, settings: saved });
        } catch (error) {
          console.error(error);
          return res.status(500).json({ ok: false, message: "保存に失敗しました" });
        }
        return res.status(201).json({ ok: true, message: "データ保存を利用していません。", settings: saved });
      }

      try {
        saved = await db.enqueue(() => db.setSettings(incoming));
      } catch (e) {
        console.error("[api/settings] db.setSettings failed", e);
        return res.status(500).json({ ok: false, message: "保存に失敗しました" });
      }

      // runtime 反映
      try {
        applySettingsToRuntime({ config, state, settings: saved });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "保存に失敗しました" });
      }

      res.json({ ok: true, settings: saved });
    }
  );

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
