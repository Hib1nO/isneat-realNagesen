function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function createSCController({ ioAdmin, ioHud, state }) {
  let running = false;

  async function start({ noticeSec, missionSec, bonusSec, magnification }) {
    if (running) return;
    running = true;

    state.sc.process = true;
    state.sc.noticeProcess = false;
    state.sc.missionProcess = false;
    state.sc.player01BonusProcess = false;
    state.sc.player02BonusProcess = false;
    state.sc.noticeSec = noticeSec;
    state.sc.missionSec = missionSec;
    state.sc.player01BonusSec = bonusSec;
    state.sc.player02BonusSec = bonusSec;
    state.sc.magnification = magnification;

    state.sc.success.player01 = false;
    state.sc.success.player02 = false;

    ioAdmin.emit("sc:start", { noticeSec, missionSec, bonusSec, magnification });
    ioHud.emit("sc:start", { noticeSec, missionSec, bonusSec, magnification });

    let t = noticeSec;
    state.sc.noticeProcess = true;
    while (t > 0 && state.sc.process) {
      state.sc.noticeSec = t;
      await sleep(1000);
      t -= 1;
    }

    ioAdmin.emit("sc:missionStart");
    ioHud.emit("sc:missionStart");

    for (const p of ["player01", "player02"]) {
      if (!state.sc.success[p]) {
        ioAdmin.emit("sc:fail", { player: p });
        ioHud.emit("sc:fail", { player: p });
      }
    }

    await sleep(3000);

    for (const p of ["player01", "player02"]) {
      if (state.sc.success[p]) {
        state.magnification[p] = magnification;
        ioAdmin.emit("sc:mainStart", { player: p, mainSec });
        ioHud.emit("sc:mainStart", { player: p, mainSec });
      }
    }

    let m = mainSec;
    while (m > 0 && state.sc.process) {
      ioAdmin.emit("sc:mainTick", { t: m });
      ioHud.emit("sc:mainTick", { t: m });
      await sleep(1000);
      m -= 1;
    }

    for (const p of ["player01", "player02"]) {
      if (state.sc.success[p]) state.magnification[p] = 1;
    }

    ioAdmin.emit("sc:end");
    ioHud.emit("sc:end");

    state.sc.process = false;
    running = false;
  }

  function markSuccess(player) {
    if (!state.sc.process) {
      ioAdmin.emit("notify", { type: "warn", message: "SC is not running." });
      return;
    }
    if (player !== "player01" && player !== "player02") return;
    state.sc.success[player] = true;
    ioAdmin.emit("sc:success", { player });
    ioHud.emit("sc:success", { player });
  }

  function stop() {
    state.sc.process = false;
  }

  return { start, markSuccess, stop };
}
