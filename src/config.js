// src/config.js
import fs from "fs";
import path from "path";

/**
 * config.json には「環境・サーバー起動に必要な最小限」だけを置く前提
 * - port, corsOrigin, tickMs, effectQueue, db
 */
export function loadBaseConfig() {
  const cfgPath = process.env.CONFIG_PATH || path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`config.json not found. path=${cfgPath}`);
  }
  const raw = fs.readFileSync(cfgPath, "utf-8");
  const base = JSON.parse(raw);

  // defaults (base only)
  base.port ??= 8088;
  base.corsOrigin ??= "*";
  base.tickMs ??= 250;
  base.effectQueue ??= { maxQueueLength: 200, maxPushPerTick: 20 };
  base.db ??= { enabled: false, dir: "./data" };

  return base;
}

/**
 * DB(settings) と baseConfig を合成して実行時設定を作る
 * - timer / gifts 等は DB(settings) 側に置く
 */
export function buildRuntimeConfig(baseConfig, dbSettings) {
  const s = dbSettings || {};

  const runtime = {
    ...baseConfig,

    // DB 側で管理する設定（無ければデフォルト）
    timer: s.timer ?? { defaultSeconds: 60 },
    gifts: s.gifts ?? {},

    // 将来拡張: s.sc などもここで合成
    sc: s.sc ?? undefined,
    lastBonusMagnification: s.lastBonusMagnification ?? 5
  };

  // giftsのキー一覧（集計で使う）
  runtime.giftKeys = Object.keys(runtime.gifts || {});
  return runtime;
}
