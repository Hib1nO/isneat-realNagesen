import express from "express";

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

  return router;
}
