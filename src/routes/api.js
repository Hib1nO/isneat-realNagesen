import express from "express";

function dbGuard(db, res) {
  if (!db?.enabled) {
    res.status(503).json({ ok: false, message: "db is disabled (config.db.enabled=false)" });
    return false;
  }
  return true;
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

export function createApiRouter({ state, config }) {
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

  router.post("/players", express.json(), async (req, res) => {
    if (!dbGuard(db, res)) return;
    const { name = "", key = null, imageUrl = "" } = req.body || {};
    const created = await db.enqueue(() => db.createPlayer({ name, key, imageUrl }));
    res.status(201).json({ ok: true, item: created });
  });

  router.put("/players/:playerId", express.json(), async (req, res) => {
    if (!dbGuard(db, res)) return;
    const updated = await db.enqueue(() => db.updatePlayer(req.params.playerId, req.body || {}));
    if (!updated) return res.status(404).json({ ok: false, message: "not found" });
    res.json({ ok: true, item: updated });
  });

  // --- settings ---
  router.get("/settings", async (req, res) => {
    if (!dbGuard(db, res)) return;
    const settings = await db.getSettings();
    res.json({ ok: true, settings });
  });

  router.put("/settings", express.json(), async (req, res) => {
    
    if (!state.timerProcessing && !state.matchProcess) return res.status(503).json({ ok: false, message: "試合を終了してから保存してください。" });
    if (!dbGuard(db, res)) return res.status(503).json({ ok: false, message: "データ保存を利用していません。" });
    const saved = await db.enqueue(() => db.setSettings(req.body || {}));
    applySettingsToRuntime({ config, state, settings: saved });
    res.json({ ok: true, settings: saved });
  });

  return router;
}
