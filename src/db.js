import fs from "fs";
import path from "path";
import Datastore from "nedb-promises";

export function createDb(config) {
  const enabled = !!config.db?.enabled;
  if (!enabled) return { enabled: false, enqueue: async () => {}, saveMatchResult: async () => {} };

  const dir = config.db?.dir ?? "./data";
  fs.mkdirSync(dir, { recursive: true });

  const matches = Datastore.create({ filename: path.join(dir, "matches.db"), autoload: true });

  // simple serialization queue
  let chain = Promise.resolve();
  function enqueue(fn) {
    chain = chain.then(fn).catch(err => console.error("[db] error", err));
    return chain;
  }

  async function saveMatchResult(doc) {
    return matches.insert({ ...doc, createdAt: Date.now() });
  }

  return { enabled: true, enqueue, saveMatchResult };
}
