import fs from "fs";
import path from "path";

export function loadConfig() {
  const cfgPath = process.env.CONFIG_PATH || path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`config.json not found. Copy config.example.json -> config.json. path=${cfgPath}`);
  }
  const raw = fs.readFileSync(cfgPath, "utf-8");
  const cfg = JSON.parse(raw);

  cfg.tickMs ??= 250;
  cfg.timer ??= { defaultSeconds: 60 };
  cfg.gifts ??= {};
  cfg.effectQueue ??= { maxQueueLength: 200, maxPushPerTick: 20 };
  cfg.db ??= { enabled: false };

  cfg.giftKeys = Object.keys(cfg.gifts);

  return cfg;
}
