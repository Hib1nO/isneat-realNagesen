import os from "os";

export function getLocalIPv4List() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) out.push({ name, address: n.address });
    }
  }
  return out;
}