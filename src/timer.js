export function startTimerLoop({ ioAdmin, ioHud, state, config, sc }) {
  setInterval(() => {
    if (!state.timerProcessing) return;

    if (state.timerPause) {
      ioAdmin.emit("pause:show");
      ioHud.emit("pause:show");
      return;
    } else {
      ioAdmin.emit("pause:hide");
      ioHud.emit("pause:hide");
    }

    state.timerCount = Math.max(0, state.timerCount - 1);
    ioAdmin.emit("timer:tick", { count: state.timerCount });
    ioHud.emit("timer:tick", { count: state.timerCount });

    if(config.sc.autoStart && state.timerCount <= config.sc.autoStartTime && !state.sc.process) {
      sc.start({
        intervalSec: Number(config.sc.intervalSeconds ?? 10),
        mainSec: Number(config.sc.sctimerSeconds ?? 10),
        magnification: Number(config.sc.scMagnification ?? 2)
      });
    }

    if (state.timerCount === 0) {
      state.timerProcessing = false;
      ioAdmin.emit("timer:done");
      ioHud.emit("timer:done");
      ioAdmin.emit("status:aggregating", { show: true });
      ioHud.emit("status:aggregating", { show: true });
    }
  }, 1000);
}

export function handleTimerStart({ ioAdmin, ioHud, state, seconds }) {
  state.matchProcess = true;
  state.timerProcessing = true;
  state.timerPause = false;
  state.timerCount = Number.isFinite(seconds) ? seconds : state.timerCount;

  ioAdmin.emit("timer:start", { count: state.timerCount });
  ioHud.emit("timer:start", { count: state.timerCount });
  ioAdmin.emit("status:aggregating", { show: false });
  ioHud.emit("status:aggregating", { show: false });
}

export function handleTimerPauseToggle({ ioAdmin, ioHud, state }) {
  if (!state.timerProcessing) {
    ioAdmin.emit("notify", { type: "warn", message: "Timer is not running." });
    return;
  }
  state.timerPause = !state.timerPause;
  ioAdmin.emit("timer:pause", { pause: state.timerPause });
  ioHud.emit("timer:pause", { pause: state.timerPause });
}
