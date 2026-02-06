function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function toSafeInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function createSCController({ ioAdmin, ioHud, state }) {
  let running = false;

  let intervalId = null;

  // bonus中に元の倍率へ戻すための退避
  const prevMagnification = { player01: 1, player02: 1 };
  
  // notice開始メッセージを一度だけ送信するためのフラグ
  let noticeMessageSent = false;

  function emitBoth(event, payload) {
    ioAdmin.emit(event, payload);
    ioHud.emit(event, payload);
  }

  function notify(type, message) {
    ioAdmin.emit("notify", { type, message });
  }

  function restoreMagnification(player) {
    const prev = prevMagnification[player];
    if (Number.isFinite(prev) && prev > 0) state.magnification[player] = prev;
    else state.magnification[player] = 1;
  }

  function clearLoop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  function finalize() {
    // bonusが走っていたら倍率を戻す
    for (const p of ["player01", "player02"]) {
      if (state.sc?.[`${p}BonusProcess`]) restoreMagnification(p);
    }

    state.sc.process = false;
    state.sc.noticeProcess = false;
    state.sc.missionProcess = false;
    state.sc.player01BonusProcess = false;
    state.sc.player02BonusProcess = false;

    state.sc.noticeSec = 0;
    state.sc.missionSec = 0;
    state.sc.player01BonusSec = 0;
    state.sc.player02BonusSec = 0;

    emitBoth("sc:end");
    running = false;
    clearLoop();
  }

  function startPlayerBonus(player) {
    if (player !== "player01" && player !== "player02") return;

    const procKey = `${player}BonusProcess`;
    const secKey = `${player}BonusSec`;

    // すでにボーナス中なら何もしない
    if (state.sc[procKey]) return;

    prevMagnification[player] = Number(state.magnification?.[player] ?? 1);

    state.sc[procKey] = true;
    state.sc[secKey] = toSafeInt(state.sc.bonusSec, 0);

    // 倍率を一時的に変更
    state.magnification[player] = Number(state.sc.magnification ?? 1);

    // 既存イベント名は維持（main=bonusとして扱う）
    emitBoth("sc:mainStart", { player, mainSec: state.sc[secKey] });
    
    // ボーナス開始通知（左右判定）
    const side = player === "player01" ? "left" : "right";
    emitBoth(`viewnotify:${side}`, {
      type: "bonus",
      theme: "bright",
      message: `<span class="highlight">${state.sc.magnification}</span>倍ボーナス | 残り${state.sc[secKey]}秒`
    });
  }

  function stopPlayerBonus(player) {
    const procKey = `${player}BonusProcess`;
    const secKey = `${player}BonusSec`;

    state.sc[procKey] = false;
    state.sc[secKey] = 0;

    restoreMagnification(player);

    // 追加イベント（既存UIが未対応でも問題なし）
    emitBoth("sc:bonusEnd", { player });
    
    // ボーナス終了通知（左右判定）
    const side = player === "player01" ? "left" : "right";
    emitBoth(`viewnotify:${side}`, {
      type: "target",
      theme: "dark",
      message: `ボーナス時間は終了しました。`
    });
    
    // 5秒後に通知を非表示
    setTimeout(() => {
      emitBoth(`hidenotify:${side}`);
    }, 5000);
  }

  function tickOnce() {
    // 外部から停止された場合
    if (!state.sc.process) {
      finalize();
      return;
    }

    // タイマー一時停止に合わせてSCも止める（要件に無ければここを外してください）
    if (state.timerPause) return;

    // ===== notice phase =====
    if (state.sc.noticeProcess) {
      // デクリメント前の値を取得
      const currentNoticeSec = Math.max(0, toSafeInt(state.sc.noticeSec, 0));
      
      // 残り5秒以下ならカウントダウン表示
      if (currentNoticeSec <= 5) {
        emitBoth("viewnotify:top", {
          type: "target",
          theme: "mid",
          message: `開始まで | ${currentNoticeSec}`
        });
      } else if (!noticeMessageSent) {
        // 初回のみ通知メッセージを送信
        emitBoth("viewnotify:top", {
          type: "target",
          theme: "mid",
          message: `まもなくスピードチャレンジが開始します。ボーナス時間中は獲得スコアが<span class="highlight">${state.sc.magnification}</span>倍になります。`
        });
        noticeMessageSent = true;
      }
      
      // デクリメント
      state.sc.noticeSec = currentNoticeSec - 1;

      if (state.sc.noticeSec <= 0) {
        state.sc.noticeProcess = false;

        // mission start
        state.sc.missionProcess = true;
        emitBoth("sc:missionStart");
      }
    }

    // ===== mission phase =====
    if (state.sc.missionProcess) {
      // デクリメント前の値を取得
      const currentMissionSec = Math.max(0, toSafeInt(state.sc.missionSec, 0));
      
      emitBoth("viewnotify:top", {
        type: "bonus",
        theme: "mid",
        message: `ミッション中 | 残り${currentMissionSec}秒`
      });
      
      // デクリメント
      state.sc.missionSec = currentMissionSec - 1;

      // mission終了判定
      if (state.sc.missionSec <= 0) {
        state.sc.missionProcess = false;

        // 成功・失敗判定
        const player01Success = state.sc.success?.player01;
        const player02Success = state.sc.success?.player02;
        
        // 両方成功した場合は中央の通知を非表示
        if (player01Success && player02Success) {
          emitBoth("hidenotify:top");
        }
        
        // 失敗したプレイヤーには失敗通知を送信
        for (const p of ["player01", "player02"]) {
          if (!state.sc.success?.[p]) {
            emitBoth("sc:fail", { player: p });
            
            const side = p === "player01" ? "left" : "right";
            emitBoth(`viewnotify:${side}`, {
              type: "target",
              theme: "dark",
              message: `ミッションに失敗しました。`
            });
          }
        }

        emitBoth("sc:missionEnd");
      }
    }

    // ===== bonus phase (per player, independent) =====
    for (const p of ["player01", "player02"]) {
      const procKey = `${p}BonusProcess`;
      const secKey = `${p}BonusSec`;

      if (!state.sc[procKey]) continue;

      // デクリメント前の値を取得
      const currentBonusSec = Math.max(0, toSafeInt(state.sc[secKey], 0));

      // 既存イベント名は維持（payloadにplayerを追加）
      emitBoth("sc:mainTick", { player: p, t: currentBonusSec });
      
      // ボーナス時間中の通知（左右判定）
      const side = p === "player01" ? "left" : "right";
      emitBoth(`viewnotify:${side}`, {
        type: "bonus",
        theme: "bright",
        message: `<span class="highlight">${state.sc.magnification}</span>倍ボーナス | 残り${currentBonusSec}秒`
      });
      
      // デクリメント
      state.sc[secKey] = currentBonusSec - 1;

      if (state.sc[secKey] <= 0) stopPlayerBonus(p);
    }

    // ===== finish =====
    const anyBonus =
      !!state.sc.player01BonusProcess || !!state.sc.player02BonusProcess;

    // missionが終わり、bonusも無ければ終了
    if (!state.sc.noticeProcess && !state.sc.missionProcess && !anyBonus) {
      finalize();
    }
  }

  function start({ noticeSec, missionSec, bonusSec, magnification } = {}) {
    if (running) {
      notify("warn", "SC is already running.");
      return;
    }

    try {
      running = true;

      state.sc.process = true;
      
      // notice開始メッセージフラグをリセット
      noticeMessageSent = false;

      // phase flags
      state.sc.noticeProcess = true;
      state.sc.missionProcess = false;
      state.sc.player01BonusProcess = false;
      state.sc.player02BonusProcess = false;

      // counters (remaining seconds)
      state.sc.noticeSec = toSafeInt(noticeSec, 0);
      state.sc.missionSec = toSafeInt(missionSec, 0);
      state.sc.bonusSec = toSafeInt(bonusSec, 0);

      // remaining (not started yet)
      state.sc.player01BonusSec = 0;
      state.sc.player02BonusSec = 0;

      // scoring magnification during bonus
      state.sc.magnification = Number.isFinite(Number(magnification))
        ? Number(magnification)
        : 1;

      // mission success flags
      state.sc.success.player01 = false;
      state.sc.success.player02 = false;

      emitBoth("sc:start", {
        noticeSec: state.sc.noticeSec,
        missionSec: state.sc.missionSec,
        bonusSec: state.sc.bonusSec,
        magnification: state.sc.magnification
      });

      clearLoop();
      intervalId = setInterval(() => {
        try {
          tickOnce();
        } catch (e) {
          console.error("[sc] tick error", e);
          notify("error", "SC error (see server logs).");
          finalize();
        }
      }, 1000);
    } catch (e) {
      console.error("[sc] start error", e);
      notify("error", "SC start failed (see server logs).");
      finalize();
    }
  }

  async function markSuccess(player) {
    try {
      if (!state.sc.process) {
        notify("warn", "SC is not running.");
        return;
      }
      if (!state.sc.missionProcess) {
        notify("warn", "Mission is not running.");
        return;
      }
      if (player !== "player01" && player !== "player02") return;

      // 二重成功は無視（例外にしない）
      if (state.sc.success[player]) return;

      state.sc.success[player] = true;

      emitBoth("sc:success", { player });

      // 左右判定
      const side = player === "player01" ? "left" : "right";
      
      // 1. ミッション成功通知
      emitBoth(`viewnotify:${side}`, {
        type: "bonus",
        theme: "mid",
        message: `ミッション成功！`
      });
      
      // 3秒待つ
      await sleep(3000);
      
      // 2. ボーナス開始予告通知
      emitBoth(`viewnotify:${side}`, {
        type: "bonus",
        theme: "mid",
        message: `まもなく<span class="highlight">${state.sc.magnification}</span>倍のボーナス時間が開始します。`
      });
      
      // 2秒待つ
      await sleep(2000);
      
      // 3. ボーナス開始（ミッションは継続）
      startPlayerBonus(player);
    } catch (e) {
      console.error("[sc] markSuccess error", e);
      notify("error", "SC success handling failed (see server logs).");
    }

  }

  function stop() {
    state.sc.process = false;
    // 外から止めたい時（安全に止める）
    state.sc.process = false;
    if (running) finalize();
  }

  return { start, markSuccess, stop };
}
