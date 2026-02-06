// game-state.js
// ゲーム状態の管理とUI更新
$(function () {
  console.log('=== game-state.js loaded ===');
  
  let socket = null;
  
  try {
    socket = io("/hud");
  } catch (e) {
    console.error("[game-state] socket.io init failed:", e);
    return;
  }

  // ============================================
  // キャッシュ・メモ化
  // ============================================
  
  const cache = {
    timerValue: null,
    matchsettings: null,
    score: null
  };

  const animatePercentageLabel = ($el, toValue, durationMs = 360) => {
    if (!$el || $el.length === 0) return;
    const to = Math.round(Number(toValue));
    const stored = Number($el.data('pctValue'));
    let from = Number.isFinite(stored) ? stored : parseFloat($el.text());
    if (!Number.isFinite(from)) from = to;

    const prevAnim = $el.data('pctAnimId');
    if (prevAnim) cancelAnimationFrame(prevAnim);

    if (from === to) {
      $el.text(to + "%");
      $el.data('pctValue', to);
      return;
    }

    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(progress);
      const value = Math.round(from + (to - from) * eased);
      $el.text(value + "%");
      if (progress < 1) {
        const id = requestAnimationFrame(step);
        $el.data('pctAnimId', id);
      } else {
        $el.data('pctValue', to);
        $el.removeData('pctAnimId');
      }
    };

    $el.data('pctValue', from);
    const id = requestAnimationFrame(step);
    $el.data('pctAnimId', id);
  };

  // データが変更されたかチェック
  const hasChanged = (key, newValue) => {
    const oldValue = cache[key];
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);
    return oldStr !== newStr;
  };

  // キャッシュを更新
  const updateCache = (key, newValue) => {
    cache[key] = JSON.parse(JSON.stringify(newValue));
  };

  // ============================================
  // UI 更新関数
  // ============================================
  
  const updateUI = (state) => {
    if (!state) return;

    // Timer更新
    if (state.timer && state.timer.count !== undefined) {
      if (hasChanged('timerValue', state.timer.count)) {
        updateTimer(state.timer.count);
        updateCache('timerValue', state.timer.count);
      }
    }

    // MatchSettings処理
    if (state.matchsettings) {
      if (hasChanged('matchsettings', state.matchsettings)) {
        updateMatchDisplay(state.matchsettings);
        updateCache('matchsettings', state.matchsettings);
      }
    }

    // スコア・バー位置更新
    if (state.score) {
      if (hasChanged('score', state.score)) {
        updateBarPosition(state.score);
        updateCache('score', state.score);
      }
    }
  };

  // ユーティリティ：タイマー表示更新
  const updateTimer = (timerValue) => {
    const $timer = $("#battleTimer");
    if ($timer.length === 0) return;

    let displayText = "00:00";

    if (timerValue !== undefined && timerValue !== null) {
      // 秒数を分:秒形式に変換
      const totalSeconds = Math.max(0, Math.floor(Number(timerValue)));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      // MM:SS 形式でフォーマット
      displayText = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    $timer.text(displayText);
  };

  // ユーティリティ：マッチ表示更新（matchformat=1 または 2 の場合）
  const updateMatchDisplay = (matchsettings) => {
    if (!matchsettings) return;

    const matchformat = matchsettings.matchformat;
    const matchplayers = matchsettings.matchplayers;
    const $avatars = $(".avatar");
    const $leftName = $("#leftName");
    const $rightName = $("#rightName");

    // matchformat = 1 の場合
    if (matchformat === 1) {
      const $leftAvatar01 = $("#leftAvatar01");
      const $rightAvatar01 = $("#rightAvatar01");

      // すべてのアバターを非表示
      if ($avatars.length > 0) {
        $avatars.hide();
      }

      // leftAvatar01 と rightAvatar01 のみ表示
      if ($leftAvatar01.length > 0) {
        $leftAvatar01.show();
      }
      if ($rightAvatar01.length > 0) {
        $rightAvatar01.show();
      }

      if (!matchplayers) return;

      // Player01（左）の画像とプレイヤー名
      const player01 = matchplayers.player01;
      if (player01) {
        if (player01.PlayerImg && $leftAvatar01.length > 0) {
          $leftAvatar01.css({
            backgroundImage: `url('${player01.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
        if (player01.PlayerName && $leftName.length > 0) {
          $leftName.text(String(player01.PlayerName));
          // 1行表示用スタイル
          $leftName.css({
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          });
        }
      }

      // Player02（右）の画像とプレイヤー名
      const player02 = matchplayers.player02;
      if (player02) {
        if (player02.PlayerImg && $rightAvatar01.length > 0) {
          $rightAvatar01.css({
            backgroundImage: `url('${player02.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
        if (player02.PlayerName && $rightName.length > 0) {
          $rightName.text(String(player02.PlayerName));
          // 1行表示用スタイル
          $rightName.css({
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          });
        }
      }
    }
    // matchformat = 2 の場合
    else if (matchformat === 2) {
      const $leftAvatar01 = $("#leftAvatar01");
      const $leftAvatar02 = $("#leftAvatar02");
      const $rightAvatar01 = $("#rightAvatar01");
      const $rightAvatar02 = $("#rightAvatar02");

      // すべてのアバターを非表示
      if ($avatars.length > 0) {
        $avatars.hide();
      }

      // 4つのアバターを表示
      if ($leftAvatar01.length > 0) {
        $leftAvatar01.show();
      }
      if ($leftAvatar02.length > 0) {
        $leftAvatar02.show();
      }
      if ($rightAvatar01.length > 0) {
        $rightAvatar01.show();
      }
      if ($rightAvatar02.length > 0) {
        $rightAvatar02.show();
      }

      if (!matchplayers) return;

      // 左チーム：Player01 と Player03
      const player01 = matchplayers.player01;
      if (player01) {
        if (player01.PlayerImg && $leftAvatar01.length > 0) {
          $leftAvatar01.css({
            backgroundImage: `url('${player01.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
      }

      const player03 = matchplayers.player03;
      if (player03) {
        if (player03.PlayerImg && $leftAvatar02.length > 0) {
          $leftAvatar02.css({
            backgroundImage: `url('${player03.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
      }

      // 左チームの名前（player01 と player03）
      if ($leftName.length > 0) {
        const player01Name = player01 && player01.PlayerName ? String(player01.PlayerName) : '';
        const player03Name = player03 && player03.PlayerName ? String(player03.PlayerName) : '';
        const leftNameText = [player01Name, player03Name].filter(Boolean).join('<br>');
        $leftName.html(leftNameText);
        // 複数行表示用スタイル
        $leftName.css({
          whiteSpace: 'normal',
          overflow: 'visible',
          textOverflow: 'unset',
          maxWidth: 'none'
        });
      }

      // 右チーム：Player02 と Player04
      const player02 = matchplayers.player02;
      if (player02) {
        if (player02.PlayerImg && $rightAvatar01.length > 0) {
          $rightAvatar01.css({
            backgroundImage: `url('${player02.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
      }

      const player04 = matchplayers.player04;
      if (player04) {
        if (player04.PlayerImg && $rightAvatar02.length > 0) {
          $rightAvatar02.css({
            backgroundImage: `url('${player04.PlayerImg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          });
        }
      }

      // 右チームの名前（player02 と player04）
      if ($rightName.length > 0) {
        const player02Name = player02 && player02.PlayerName ? String(player02.PlayerName) : '';
        const player04Name = player04 && player04.PlayerName ? String(player04.PlayerName) : '';
        const rightNameText = [player02Name, player04Name].filter(Boolean).join('<br>');
        $rightName.html(rightNameText);
        // 複数行表示用スタイル
        $rightName.css({
          whiteSpace: 'normal',
          overflow: 'visible',
          textOverflow: 'unset',
          maxWidth: 'none'
        });
      }
    }
  };

  // ユーティリティ：バー位置更新
  const updateBarPosition = (score) => {
    const player01Score = Number(score.player01) || 0;
    const player02Score = Number(score.player02) || 0;
    const totalScore = player01Score + player02Score;

    let leftPercentage = 50; // デフォルト 50%

    if (totalScore > 0) {
      leftPercentage = (player01Score / totalScore) * 100;
    }

    const rightPercentage = 100 - leftPercentage;

    const $leftFill = $("#leftFill");
    const $rightFill = $("#rightFill");
    const $leftPct = $("#leftPct");
    const $rightPct = $("#rightPct");
    const $battleData = $(".battle");

    // Fill width更新
    if ($leftFill.length > 0) {
      $leftFill.css("width", leftPercentage + "%");
    }
    if ($rightFill.length > 0) {
      $rightFill.css("width", rightPercentage + "%");
    }

    // ラベル更新（数値をアニメーション）
    if ($leftPct.length > 0) {
      animatePercentageLabel($leftPct, leftPercentage);
    }
    if ($rightPct.length > 0) {
      animatePercentageLabel($rightPct, rightPercentage);
    }

    // data属性更新（利便性のため）
    if ($battleData.length > 0) {
      $battleData.attr("data-left", Math.round(leftPercentage));
      $battleData.attr("data-right", Math.round(rightPercentage));
    }
  };

  // ============================================
  // Socket イベントハンドラ
  // ============================================

  if (socket) {
    // 初期状態を受け取る
    socket.on("state:init", (state) => {
      console.debug("[game-state] state:init received:", state);
      updateUI(state);
    });

    // 状態更新を受け取る
    socket.on("state:update", (state) => {
      console.debug("[game-state] state:update received (with cache comparison)");
      updateUI(state);
    });

    // タイマー更新
    socket.on("timer:update", (data) => {
      if (data && data.count !== undefined) {
        if (hasChanged('timerValue', data.count)) {
          updateTimer(data.count);
          updateCache('timerValue', data.count);
        }
      }
    });

    // スコア更新
    socket.on("score:update", (data) => {
      if (data) {
        if (hasChanged('score', data)) {
          updateBarPosition(data);
          updateCache('score', data);
        }
      }
    });
  }

  // グローバルAPI公開（デバッグ・外部連携用）
  window.GameState = {
    updateUI,
    updateTimer,
    updateMatchDisplay,
    updateBarPosition,
    getCache: () => cache  // デバッグ用
  };
});
