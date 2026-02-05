// battle-bar.js (jQuery版)
// - Timer + Notice UI (2 patterns)
// - Width auto animation + overflow marquee
// - Pattern switch: vertical flip (rotateX)

$(function () {
  console.log('=== battle-bar.js loaded and jQuery ready ===');
  const logPrefix = "[battle-bar]";
  const notifySafe = (msg, err) => {
    // 例外時：ログと通知（このHUDでは通知UIが無い前提のためログのみ）
    if (err) console.error(logPrefix, msg, err);
    else console.warn(logPrefix, msg);
  };

  // --- Socket ---
  let socket = null;
  try {
    socket = io("/hud");
    socket.on("connect", function () {
      console.log(logPrefix, "connected:", socket.id);
    });
    socket.on("state:init", function (state) {
      console.log(logPrefix, "state:init", state);
    });
  } catch (e) {
    notifySafe("socket.io init failed", e);
  }

  // --- Timer ---
  const $timer = $("#battleTimer");
  const setTimerText = (text) => {
    if ($timer.length === 0) return;
    $timer.text(String(text ?? ""));
  };
  setTimerText("88:88");

  // --- Notice Controller ---
  const $noticeWrap = $("#battleNoticeWrap");
  const $noticeCard = $("#battleNoticeCard");

  const $targetFace = $(".noticeFace--target");
  const $bonusFace = $(".noticeFace--bonus");

  const $targetCount = $("#noticeTargetCount");
  const $bonusSec = $("#noticeBonusSec");
  const $targetItem = $("#noticeTargetItem");
  const $bonusItem = $("#noticeBonusItem");

  let currentPattern = "target"; // target | bonus
  const _marqueeDelayTimers = { target: null, bonus: null };

  const getMaxNoticeWidth = () => Math.floor($(window).width() * 0.8);

  const calcDesiredWidth = ($face) => {
    try {
      // Measure the single marquee item (avoid duplicated content affecting scrollWidth)
      const $item0 = $face.find(".marquee__track .marquee__item").first();
      let bodyW = 0;
      if ($item0.length) {
        bodyW = $item0.get(0).scrollWidth;
      } else {
        const $label = $face.find(".notice__label").first();
        bodyW = $label.length ? $label.get(0).scrollWidth : 0;
      }

      // padding from .noticeFace__content (--notice-pad-x = 27px each side)
      const contentPadding = 54;
      // icon presence adds width (icon 42px + gap ~15px)
      const $icon = $face.find(".notice__icon:not(.notice__icon--spacer)");
      const iconAdd = $icon.length ? 57 : 0;

      const needed = Math.ceil(bodyW + contentPadding + iconAdd);
      const min = 120;
      return Math.min(getMaxNoticeWidth(), Math.max(min, needed));
    } catch (e) {
      notifySafe("calcDesiredWidth failed", e);
      return getMaxNoticeWidth();
    }
  };

  const applyWidth = (pattern) => {
    if ($noticeWrap.length === 0) return;
    const $face = pattern === "bonus" ? $bonusFace : $targetFace;
    const w = calcDesiredWidth($face);
    // avoid reapplying nearly-equal widths to prevent jitter
    const cur = $noticeWrap.width() || 0;
    if (Math.abs(cur - w) < 1) return;
    $noticeWrap.css("width", w + "px");
  };

  const applyMarquee = ($face, allowStart = true, initialHoldSec = 0) => {
    try {
      const marquee = $face.find(".marquee").get(0);
      const track = $face.find(".marquee__track").get(0);
      const $items = $face.find(".marquee__track .marquee__item");
      if (!marquee || !track || $items.length < 2) return;

      const item0 = $items.get(0);
      const item1 = $items.get(1);

      // rAF to ensure layout is updated
      requestAnimationFrame(() => {
        const containerW = marquee.clientWidth;
        const contentW = item0.scrollWidth;

        const gap = 51; // sync with CSS gap
        if (contentW > containerW + 2) {
          // overflow case
          if (allowStart || $face.hasClass("is-marquee")) {
            // start or continue marquee
            // 1) duplicate content into second item
            item1.innerHTML = item0.innerHTML;

            // 2) compute shift/duration and set CSS vars BEFORE enabling animation
            const shift = contentW + gap;
            const pxPerSec = 70;
            const dur = Math.max(4, shift / pxPerSec);
            track.style.setProperty("--marquee-shift", shift + "px");
            track.style.setProperty("--marquee-dur", dur + "s");
            // hold the initial view for a short period before starting the scroll
            const hold = Number(initialHoldSec) || 0;
            track.style.setProperty("--marquee-delay", hold + "s");
            // also set inline animation as a fallback to ensure animation runs
            try {
              // shorthand: name duration timing-function delay iteration-count
              track.style.animation = `notice-marquee ${dur}s linear ${hold}s infinite`;
            } catch (e) { /* ignore */ }

            console.debug(logPrefix, 'start marquee', {
              pattern: $face.attr('data-pattern'), containerW, contentW, shift, dur, hold
            });

            // 3) ensure the visual start frame is the head: set inline transform to 0,
            //    force reflow, then clear inline transform so CSS animation can take over
            try {
              track.style.transform = 'translateX(0)';
              track.getBoundingClientRect();
              track.style.transform = '';
            } catch (e) { /* ignore */ }

            // 4) add class that enables marquee mode (makes duplicated item visible and starts animation)
            // mark pending so other refresh calls won't prematurely clear it
            try { $face.data('marqueePending', true); } catch (e) {}
            $face.addClass("is-marquee");
            // clear pending flag after hold + small margin so scheduled refresh won't cancel
            try {
              const clearAfter = Math.max(0, (hold * 1000) + 120);
              setTimeout(() => {
                try { $face.removeData('marqueePending'); } catch (e) {}
              }, clearAfter);
            } catch (e) { /* ignore */ }
          } else {
            // overflow but not allowed to start yet -> ensure marquee is off
            item1.innerHTML = "";
            $face.removeClass("is-marquee");
            track.style.setProperty("--marquee-shift", "0px");
            track.style.setProperty("--marquee-dur", "0s");
            track.style.setProperty("--marquee-delay", "0s");
            try { track.style.animation = 'none'; } catch (e) {}
            try { $face.removeData('marqueePending'); } catch (e) {}
          }
        } else {
          // no overflow -> ensure marquee is off
          item1.innerHTML = "";
          $face.removeClass("is-marquee");
          track.style.setProperty("--marquee-shift", "0px");
          track.style.setProperty("--marquee-dur", "0s");
          track.style.setProperty("--marquee-delay", "0s");
          try { track.style.animation = 'none'; } catch (e) {}
          try { $face.removeData('marqueePending'); } catch (e) {}
        }
      });
    } catch (e) {
      notifySafe("applyMarquee failed", e);
    }
  };

  const clearMarqueeDelay = (name) => {
    try {
      if (!name) return;
      if (_marqueeDelayTimers[name]) {
        clearTimeout(_marqueeDelayTimers[name]);
        _marqueeDelayTimers[name] = null;
      }
    } catch (e) { /* ignore */ }
  };

  const setNoticeHTML = (pattern, html) => {
    const next = pattern === "bonus" ? "bonus" : "target";
    const $faceItem = next === "bonus" ? $bonusItem : $targetItem;
    const $face = next === "bonus" ? $bonusFace : $targetFace;

    try {
      $faceItem.html(html);
      // If the updated face is currently visible, animate width now and schedule marquee.
      // If it's hidden, only update the DOM (store desired width) and don't start marquee/touch container width —
      // this prevents brief auto-scroll when updating the hidden face.
      if (next === currentPattern) {
        // adjust width immediately but do NOT start marquee yet
        refreshLayout(next, false);
        setTimeout(() => refreshLayout(next, false), 360);

        // start marquee with initial hold so it doesn't jump immediately
        clearMarqueeDelay(next);
        applyMarquee($face, true, 2);
      } else {
        // hidden face: compute and cache desired width for later, but don't change container now
        try {
          const w = calcDesiredWidth($face);
          $face.data('desiredWidth', w);
        } catch (e) { /* ignore */ }
        // also clear any pending timer for this face
        clearMarqueeDelay(next);
      }
    } catch (e) {
      notifySafe('setNoticeHTML failed', e);
    }
  };

  const refreshLayout = (pattern, allowMarqueeStart = false) => {
    // when we're not allowing marquee to start (e.g. immediately after switching),
    // ensure any existing marquee state is cleared so it won't continue unexpectedly
    if (!allowMarqueeStart) {
      [$targetFace, $bonusFace].forEach(($f) => {
        try {
          // if this face is pending marquee start, skip clearing it
          if ($f.data && $f.data('marqueePending')) return;
          const track = $f.find('.marquee__track').get(0);
          const $items = $f.find('.marquee__track .marquee__item');
          if ($items && $items.length >= 2) {
            $items.get(1).innerHTML = "";
          }
          $f.removeClass('is-marquee');
          if (track) {
            track.style.setProperty('--marquee-shift', '0px');
            track.style.setProperty('--marquee-dur', '0s');
            try { track.style.animation = 'none'; } catch (e) {}
          }
        } catch (e) {
          /* ignore */
        }
      });
    }

    applyWidth(pattern);
    // when allowMarqueeStart is true, start marquee with a hold (2s)
    applyMarquee(pattern === "bonus" ? $bonusFace : $targetFace, allowMarqueeStart, allowMarqueeStart ? 2 : 0);
  };

  const setNoticeTheme = (theme) => {
    if ($noticeWrap.length === 0) return;
    const v = String(theme || "mid");
    $noticeWrap.attr("data-theme", v);
  };

  const showNotice = (pattern, payload = {}) => {
    console.debug(logPrefix, 'showNotice called', { pattern, payload, wrapLen: $noticeWrap.length, cardLen: $noticeCard.length });
    if ($noticeWrap.length === 0 || $noticeCard.length === 0) {
      console.warn(logPrefix, 'showNotice: missing DOM elements', { wrapLen: $noticeWrap.length, cardLen: $noticeCard.length });
      return;
    }
    const next = pattern === "bonus" ? "bonus" : "target";

    try {
      // content update (color switch is cut, per requirement)
      if (next === "target") {
        if (payload.count != null) $targetCount.text(String(payload.count));
        if (payload.html != null) setNoticeHTML('target', payload.html);
      } else {
        if (payload.seconds != null) $bonusSec.text(String(payload.seconds));
        if (payload.html != null) setNoticeHTML('bonus', payload.html);
      }

      // show animation: expand from center
      $noticeWrap.addClass("is-visible");
      // ensure visibility by directly setting CSS in case CSS selector doesn't apply
      try {
        $noticeWrap.css({opacity: '1', transform: 'scaleX(1)'});
        console.debug(logPrefix, 'notice shown (class is-visible added + inline CSS set)');
      } catch (e) {
        console.debug(logPrefix, 'notice shown (class is-visible added)');
      }

      // flip if pattern changed
      if (next !== currentPattern) {
        $noticeCard.toggleClass("is-flipped", next === "bonus");
        currentPattern = next;
      } else {
        // still ensure correct side state
        $noticeCard.toggleClass("is-flipped", next === "bonus");
      }

      // after flip starts: if we have a cached desired width for this face (updated while hidden), use it;
      // otherwise recalc. Do not allow marquee to start immediately.
      const $visibleFace = next === "bonus" ? $bonusFace : $targetFace;

      // clear any pending marquee timers for this face to avoid carry-over
      clearMarqueeDelay(next);

      // if we have a cached width (from earlier hidden update), apply it
      const cached = $visibleFace.data('desiredWidth');
      if (typeof cached === 'number') {
        const cur = $noticeWrap.width() || 0;
        if (Math.abs(cur - cached) >= 1) {
          $noticeWrap.css('width', cached + 'px');
        }
        // clear cached value now that we've applied it
        $visibleFace.removeData('desiredWidth');
      } else {
        // recalc and apply width normally
        refreshLayout(next, false);
      }
      // run a second refresh after flip animation to ensure layout correctness
      setTimeout(() => refreshLayout(next, false), 360);

      // start marquee for visible face with initial hold (2s)
      clearMarqueeDelay(next);
      applyMarquee($visibleFace, true, 2);
    } catch (e) {
      notifySafe("showNotice failed", e);
    }
  };

  const hideNotice = () => {
    if ($noticeWrap.length === 0) return;
    // fade out with CSS transition
    try {
      $noticeWrap.css({opacity: '0', transform: 'scaleX(0)'});
    } catch (e) { /* ignore */ }
    $noticeWrap.removeClass("is-visible");
    // clear pending marquee timers and stop any marquee
    clearMarqueeDelay('target');
    clearMarqueeDelay('bonus');
    [$targetFace, $bonusFace].forEach(($f) => {
      try {
        $f.removeClass('is-marquee');
        const track = $f.find('.marquee__track').get(0);
        if (track) {
          track.style.setProperty('--marquee-shift', '0px');
          track.style.setProperty('--marquee-dur', '0s');
        }
      } catch (e) { /* ignore */ }
    });
  };

  // initial demo state
  setNoticeTheme("mid");
  showNotice("target", { count: 2 });

  // expose for debug / server integration
  window.BattleBarUI = {
    setTimerText,
    showNotice,
    hideNotice,
    setNoticeTheme,
    refreshNoticeLayout: () => refreshLayout(currentPattern),
    // update content with HTML allowed (pattern: 'target'|'bonus')
    setNoticeHTML: (pattern, html) => setNoticeHTML(pattern, html),
    // convenience: set plain text (wraps in span.notice__label with proper styling)
    setNoticeText: (pattern, text) => setNoticeHTML(pattern, `<span class="notice__label">${String(text)}</span>`),
  };

  // --- Optional: Socket hooks (when server is ready) ---
  if (socket) {
    // {text:"12:34"}
    socket.on("battlebar:timer", (p) => {
      try {
        setTimerText(p?.text ?? "");
      } catch (e) {
        notifySafe("battlebar:timer handler failed", e);
      }
    });

    // {pattern:"target"|"bonus", theme:"mid", visible:true, ...payload}
    socket.on("battlebar:notice", (p) => {
      try {
        if (!p) return;
        if (p.theme) setNoticeTheme(p.theme);
        if (p.visible === false) return hideNotice();
        showNotice(p.pattern, p);
      } catch (e) {
        notifySafe("battlebar:notice handler failed", e);
      }
    });
  }

  // --- Resize: keep max 80% and marquee correct ---
  let resizeTimer = null;
  $(window).on("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => refreshLayout(currentPattern), 120);
  });

  // --- Demo slider (existing) ---
  const $slider = $("#slider");
  if ($slider.length) {
    const $sliderVal = $("#sliderVal");
    const $leftFill = $("#leftFill");
    const $rightFill = $("#rightFill");
    const $leftPct = $("#leftPct");
    const $rightPct = $("#rightPct");
    const $leftScore = $("#leftScore");
    const $rightScore = $("#rightScore");

    const fmt = (n) => Number(n).toLocaleString("ja-JP");

    function setPct(left) {
      left = Number(left);
      if (Number.isNaN(left)) left = 0;

      left = Math.max(0, Math.min(100, left));
      const right = 100 - left;

      $leftFill.css("width", left + "%");
      $rightFill.css("width", right + "%");

      $leftPct.text(left + "%");
      $rightPct.text(right + "%");

      // スコアは適当に連動（デモ）
      const base = 20000;
      if ($leftScore.length) $leftScore.text(fmt(Math.round(base * (left / 100))));
      if ($rightScore.length) $rightScore.text(fmt(Math.round(base * (right / 100))));
    }

    $slider.on("input", function () {
      const raw = $(this).val(); // 文字列
      $sliderVal.text(String(raw));
      setPct(raw);
    });

    // 初期表示
    const init = $slider.val();
    $sliderVal.text(String(init));
    setPct(init);
  }

  $('#testBtn01').on('click', () => {
    window.BattleBarUI.showNotice("target", {count: 52});
  })

  $('#testBtn02').on('click', () => {
    window.BattleBarUI.showNotice("bonus", {seconds: "10秒"});
  })

  $('#testBtn03').on('click', () => {
    window.BattleBarUI.setNoticeTheme("dark");
  })

  $('#testBtn04').on('click', () => {
    window.BattleBarUI.setNoticeTheme("mid");
  })

  $('#testBtn05').on('click', () => {
    window.BattleBarUI.setNoticeTheme("bright");
  })

  $('#testBtn06').on('click', () => {
    window.BattleBarUI.hideNotice();
  })

  $('#testBtn07').on('click', () => {
    window.BattleBarUI.setNoticeText("target", "目標人数：10人");
  })

  $('#testBtn08').on('click', () => {
    window.BattleBarUI.setNoticeText("target", "まもなくスピードチャレンジが開始します。ボーナス時間中は獲得スコアが3倍になります。");
  })

  $('#testBtn09').on('click', () => {
    window.BattleBarUI.setNoticeText("bonus", "初ギフトでポイント2倍｜15秒");
  })

  $('#testBtn10').on('click', () => {
    window.BattleBarUI.setNoticeText("bonus", "春の雨がようやく上がった夕方、まだ水たまりが点々と残る歩道をゆっくり歩きながら駅へ向かうと、濡れたアスファルトの匂いに混じってどこかの店から焼きたてのパンの甘い香りが漂い、信号待ちの人たちの肩越しに見えた薄い雲の切れ間から差し込む淡い光が、ビルの窓や街灯のガラスに反射して細かく揺れているのに気づいて、ほんの少し前まで頭の中を占領していた雑多な心配事――返信しそびれた連絡や、思い通りに進まない作業や、理由のはっきりしない焦り――が、その光の揺れと一緒にゆっくりとほどけていくような気がして、立ち止まったついでにイヤホンの音量を落とし、周囲の音に耳を澄ますと、遠くで電車の走る低い響きや、自転車のベル、誰かの笑い声、閉店準備のシャッターの軋む音が一つの街の呼吸みたいに重なり合い、そんな当たり前の景色の中に自分も確かに混ざっているのだと思うと、不思議なくらい肩の力が抜けて、完璧な答えを今すぐ出さなくても、今日できることを一つずつ片付けていけばいいのかもしれない、いや、むしろそうやって進むしかないのだと腹の底で静かに納得し、空の色が少しずつ群青に傾いていくのを眺めながら、さっきまで「嫌だな」と感じていた帰り道が、いつの間にか小さな回復の時間に変わっていることに気づき、改札の前でポケットの中の切符を探し当てたときには、今日という一日が思ったより悪くないどころか、案外ちゃんと意味を持って積み重なっているのかもしれないと、ほんの少しだけ前向きな気持ちになっていた。");
  })
});
