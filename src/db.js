// src/db.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Datastore from "nedb-promises";

const SETTINGS_KEY = "app";

function newId() {
  // Node.js v24+ OK
  return crypto.randomUUID();
}

export function createDb(config) {
  const enabled = !!config.db?.enabled;
  if (!enabled) {
    return {
      enabled: false,
      enqueue: async (fn) => (typeof fn === "function" ? fn() : undefined),

      // matches
      createMatch: async () => null,
      listMatches: async () => [],
      getMatchById: async () => null,

      // players
      createPlayer: async () => null,
      updatePlayer: async () => null,
      listPlayers: async () => [],
      getPlayerById: async () => null,

      // settings
      getSettings: async () => null,
      setSettings: async () => null
    };
  }

  const dir = config.db?.dir ?? "./data";
  fs.mkdirSync(dir, { recursive: true });

  const matches = Datastore.create({ filename: path.join(dir, "matches.db"), autoload: true });
  const players = Datastore.create({ filename: path.join(dir, "players.db"), autoload: true });
  const settings = Datastore.create({ filename: path.join(dir, "settings.db"), autoload: true });

  // indexes (best-effort)
  Promise.all([
    matches.ensureIndex({ fieldName: "matchId", unique: true }),
    players.ensureIndex({ fieldName: "playerId", unique: true }),
    settings.ensureIndex({ fieldName: "key", unique: true })
  ]).catch((err) => console.error("[db] ensureIndex error", err));

  // simple serialization queue (write-safety)
  let chain = Promise.resolve();
  function enqueue(fn) {
    chain = chain.then(fn).catch((err) => console.error("[db] error", err));
    return chain;
  }

  // ===== matches =====
  async function createMatch(doc) {
    const matchId = newId();
    const now = Date.now();
    return matches.insert({ matchId, ...doc, createdAt: now });
  }

  async function listMatches({ limit = 50, skip = 0 } = {}) {
    // newest first
    return matches.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }

  async function getMatchById(matchId) {
    return matches.findOne({ matchId });
  }

  // ===== players =====
  async function createPlayer({ name = "", key = null, imageUrl = "" } = {}) {
    const playerId = newId();
    const now = Date.now();
    return players.insert({
      playerId,
      key, // 任意: "player01" / "player02" など紐付けたい場合に使う
      name,
      imageUrl,
      createdAt: now,
      updatedAt: now
    });
  }

  async function updatePlayer(playerId, patch = {}) {
    const now = Date.now();
    const allowed = {};
    if (patch.name !== undefined) allowed.name = String(patch.name);
    if (patch.key !== undefined) allowed.key = patch.key === null ? null : String(patch.key);
    if (patch.imageUrl !== undefined) allowed.imageUrl = String(patch.imageUrl);

    await players.update(
      { playerId },
      { $set: { ...allowed, updatedAt: now } },
      { upsert: false }
    );
    return getPlayerById(playerId);
  }

  async function deletePlayer(playerId) {
    // returns true if a document was removed
    const removedCount = await players.remove({ playerId }, { multi: false });
    return removedCount > 0;
  }

  async function listPlayers({ limit = 200, skip = 0 } = {}) {
    // createdAt asc
    return players.find({}).sort({ createdAt: 1 }).skip(skip).limit(limit).exec();
  }

  async function getPlayerById(playerId) {
    return players.findOne({ playerId });
  }

  // ===== settings =====
  async function getSettings() {
    const doc = await settings.findOne({ key: SETTINGS_KEY });
    return doc?.value ?? null;
  }

  async function setSettings(value) {
    const now = Date.now();
    await settings.update(
      { key: SETTINGS_KEY },
      { $set: { key: SETTINGS_KEY, value, updatedAt: now } },
      { upsert: true }
    );
    return getSettings();
  }

  return {
    enabled: true,
    enqueue,

    // matches
    createMatch,
    listMatches,
    getMatchById,

    // players
    createPlayer,
    updatePlayer,
    deletePlayer,
    listPlayers,
    getPlayerById,

    // settings
    getSettings,
    setSettings
  };
}
