export function createInitialState(config) {
  const makeGiftObj = () => Object.fromEntries(config.giftKeys.map(k => [k, 0]));

  return {
    matchProcess: false,

    // timer
    timerProcessing: false,
    timerPause: false,
    timerCount: config.timer.defaultSeconds,

    // matchsettings
    matchFormat: 1,
    matchplayers: config.matchplayers,

    // score
    total: { player01: 0, player02: 0 },
    magnification: { player01: 1, player02: 1 },

    // snapshots for diff
    lastSnapshot: { player01: makeGiftObj(), player02: makeGiftObj() },
    latestSnapshot: null, // latest wins

    // effects
    videoQueue: { player01: [], player02: [] },

    // speed challenge
    sc: {
      process: false,
      noticeSec: config.sc.noticeSeconds,
      missionSec: config.sc.missionSeconds,
      player01BonusSec: config.sc.bonusSeconds,
      player02BonusSec: config.sc.bonusSeconds,
      autoStart: config.sc.autoStart,
      autoStartTime: config.sc.autoStartTime,
      success: { player01: false, player02: false }
    },

    lastBounsProcess: {
      player01: false,
      player02: false,
    }
  };
}

export function resetMatch(state, config) {
  state.matchProcess = false;

  state.timerProcessing = false;
  state.timerPause = false;
  state.timerCount = config.timer.defaultSeconds;

  state.total.player01 = 0;
  state.total.player02 = 0;
  state.magnification.player01 = 1;
  state.magnification.player02 = 1;

  for (const p of ["player01", "player02"]) {
    for (const k of config.giftKeys) state.lastSnapshot[p][k] = 0;
  }
  state.latestSnapshot = null;

  state.videoQueue.player01 = [];
  state.videoQueue.player02 = [];

  state.sc.process = false;
  state.sc.noticeSec = config.sc.noticeSeconds
  state.sc.success.player01 = false;
  state.sc.success.player02 = false;
  state.lastBounsProcess.player01 = false;
  state.lastBounsProcess.player02 = false;
}

export function applySnapshotDiff(state, config, snapshot) {
  if (!state.matchProcess) return { changed: false, pushedEffects: { player01: 0, player02: 0 } };

  let changed = false;
  const pushedEffects = { player01: 0, player02: 0 };
  const maxPushPerTick = config.effectQueue.maxPushPerTick ?? 20;
  const maxQueueLength = config.effectQueue.maxQueueLength ?? 200;

  for (const player of ["player01", "player02"]) {
    const curObj = snapshot?.[player] ?? {};
    const lastObj = state.lastSnapshot[player];
    const mag = state.magnification[player] ?? 1;

    for (const giftKey of config.giftKeys) {
      const cur = Number(curObj[giftKey] ?? 0);
      const prev = Number(lastObj[giftKey] ?? 0);
      const delta = cur - prev;

      if (delta > 0) {
        const unit = Number(config.gifts?.[giftKey]?.unitScore ?? 0);
        const add = delta * unit * mag;
        if (add !== 0) {
          state.total[player] += add;
          changed = true;
        }

        const videos = config.gifts?.[giftKey]?.effectVideos ?? [];
        if (videos.length > 0) {
          const q = state.videoQueue[player];
          for (let i = 0; i < delta; i++) {
            if (pushedEffects[player] >= maxPushPerTick) break;
            if (q.length >= maxQueueLength) break;
            q.push(videos[0]);
            pushedEffects[player] += 1;
            changed = true;
          }
        }
      }

      // update baseline even if delta < 0 (reset/rollback)
      lastObj[giftKey] = cur;
    }
  }

  return { changed, pushedEffects };
}

export function getPublicState(state) {
  return {
    matchProcess: state.matchProcess,
    timer: {
      processing: state.timerProcessing,
      pause: state.timerPause,
      count: state.timerCount
    },
    matchsettings: {
      matchformat: state.matchFormat,
      matchplayers: state.matchplayers
    },
    score: {
      player01: state.total.player01,
      player02: state.total.player02,
      magnification: { ...state.magnification }
    },
    effects: {
      player01QueueLen: state.videoQueue.player01.length,
      player02QueueLen: state.videoQueue.player02.length
    },
    sc: { ...state.sc },
    lastbounsprocess: { ...state.lastBounsProcess }
  };
}
