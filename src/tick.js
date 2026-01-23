import { applySnapshotDiff, getPublicState } from "./state.js";

export function startTick({ ioAdmin, ioHud, state, config }) {
  const tickMs = config.tickMs ?? 250;

  setInterval(() => {
    // latest-wins snapshot
    const snapshot = state.latestSnapshot;
    state.latestSnapshot = null;

    let diffRes = { changed: false, pushedEffects: { player01: 0, player02: 0 } };
    if (snapshot) {
      diffRes = applySnapshotDiff(state, config, snapshot);
    }

    // broadcast (every tick)
    const pub = getPublicState(state);
    ioAdmin.emit("state:update", pub);
    ioHud.emit("state:update", pub);

    // effects queue update (only when new effects pushed)
    if (diffRes.pushedEffects.player01 > 0 || diffRes.pushedEffects.player02 > 0) {
      ioHud.emit("effect:queue", {
        player01: state.videoQueue.player01,
        player02: state.videoQueue.player02
      });
    }
  }, tickMs);
}
