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

  const barSeqDefaults = {
    left: {
      folderPath: "/assets/video/HUDEffectsLeftPlayer",
      totalFrames: 44,
    },
    right: {
      folderPath: "/assets/video/HUDEffectsRightPlayer",
      totalFrames: 44,
    }
  };
  let barLeftPlayer = null;
  let barRightPlayer = null;

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
            const startPad = 1.5;
            const shift = contentW + gap + startPad;
            const pxPerSec = 70;
            const dur = Math.max(4, shift / pxPerSec);
            track.style.setProperty("--marquee-shift", shift + "px");
            track.style.setProperty("--marquee-dur", dur + "s");
            track.style.setProperty("--marquee-pad", startPad + "em");
            // hold the initial view for a short period before starting the scroll
            const hold = Number(initialHoldSec) || 2;
            track.style.setProperty("--marquee-delay", hold + "s");
            // reset animation so delay takes effect even when restarting while already running
            try{
              track.style.animation = 'none';
              track.getBoundingClientRect(); // force reflow
            } catch (e) { /* ignore */ }
            // also set inline animation as a fallback to ensure animation runs
            try {
              // shorthand: name duration timing-function delay iteration-count
              track.style.animation = `notice-marquee ${dur}s linear ${hold}s infinite`;
              track.style.animationFillMode = "both";
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
            track.style.setProperty("--marquee-pad", "0px");
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
          track.style.setProperty("--marquee-pad", "0px");
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
        // delay until width animation completes (260ms) to prevent layout shift
        clearMarqueeDelay(next);
        setTimeout(() => {
          applyMarquee($face, true, 2);
        }, 260);
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
      // set theme if provided
      if (payload.theme) setNoticeTheme(payload.theme);
      
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
        // delay until width animation completes (260ms) to prevent layout shift
        setTimeout(() => {
          applyMarquee($visibleFace, true, 2);
        }, 260);
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
  // setNoticeTheme("mid");
  // showNotice("target", { count: 2 });

  // --- Left and Right Notice Controller ---
  const createNoticeController = (noticeWrapId, noticeCardId, targetFaceSelector, bonusFaceSelector, targetItemId, bonusItemId) => {
    const $wrap = $(`#${noticeWrapId}`);
    const $card = $(`#${noticeCardId}`);
    const $targetFace = $(`${targetFaceSelector}`).closest('.noticeWrap').find('.noticeFace--target');
    const $bonusFace = $(`${bonusFaceSelector}`).closest('.noticeWrap').find('.noticeFace--bonus');
    const $targetItem = $(`#${targetItemId}`);
    const $bonusItem = $(`#${bonusItemId}`);
    
    let currentPattern = "target";
    const marqueeDelayTimers = { target: null, bonus: null };

    const calcDesiredWidth = ($face) => {
      try {
        const $item0 = $face.find(".marquee__track .marquee__item").first();
        let bodyW = 0;
        if ($item0.length) {
          bodyW = $item0.get(0).scrollWidth;
        } else {
          const $label = $face.find(".notice__label").first();
          bodyW = $label.length ? $label.get(0).scrollWidth : 0;
        }
        const contentPadding = 54;
        const $icon = $face.find(".notice__icon:not(.notice__icon--spacer)");
        const iconAdd = $icon.length ? 57 : 0;
        const needed = Math.ceil(bodyW + contentPadding + iconAdd);
        const min = 120;
        return Math.min(getMaxNoticeWidth(), Math.max(min, needed));
      } catch (e) {
        notifySafe(`calcDesiredWidth failed for ${noticeWrapId}`, e);
        return getMaxNoticeWidth();
      }
    };

    const applyWidth = (pattern) => {
      if ($wrap.length === 0) return;
      const $face = pattern === "bonus" ? $bonusFace : $targetFace;
      const w = calcDesiredWidth($face);
      const cur = $wrap.width() || 0;
      if (Math.abs(cur - w) < 1) return;
      $wrap.css("width", w + "px");
    };

    const applyMarquee = ($face, allowStart = true, initialHoldSec = 0) => {
      try {
        const marquee = $face.find(".marquee").get(0);
        const track = $face.find(".marquee__track").get(0);
        const $items = $face.find(".marquee__track .marquee__item");
        if (!marquee || !track || $items.length < 2) return;

        const item0 = $items.get(0);
        const item1 = $items.get(1);

        requestAnimationFrame(() => {
          const containerW = marquee.clientWidth;
          const contentW = item0.scrollWidth;
          const gap = 51;
          if (contentW > containerW + 2) {
            if (allowStart || $face.hasClass("is-marquee")) {
              item1.innerHTML = item0.innerHTML;
              const startPad = 1;
              const shift = contentW + gap + startPad;
              const pxPerSec = 70;
              const dur = Math.max(4, shift / pxPerSec);
              track.style.setProperty("--marquee-shift", shift + "px");
              track.style.setProperty("--marquee-dur", dur + "s");
              track.style.setProperty("--marquee-pad", startPad + "em");
              const hold = Number(initialHoldSec) || 2;
              track.style.setProperty("--marquee-delay", hold + "s");
              try{
                track.style.animation = 'none';
                track.getBoundingClientRect();
              } catch (e) { /* ignore */ }
              try {
                track.style.animation = `notice-marquee ${dur}s linear ${hold}s infinite`;
                track.style.animationFillMode = "both";
              } catch (e) { /* ignore */ }
              try {
                track.style.transform = 'translateX(0)';
                track.getBoundingClientRect();
                track.style.transform = '';
              } catch (e) { /* ignore */ }
              try { $face.data('marqueePending', true); } catch (e) {}
              $face.addClass("is-marquee");
              try {
                const clearAfter = Math.max(0, (hold * 1000) + 120);
                setTimeout(() => {
                  try { $face.removeData('marqueePending'); } catch (e) {}
                }, clearAfter);
              } catch (e) { /* ignore */ }
            } else {
              item1.innerHTML = "";
              $face.removeClass("is-marquee");
              track.style.setProperty("--marquee-shift", "0px");
              track.style.setProperty("--marquee-dur", "0s");
              track.style.setProperty("--marquee-delay", "0s");
              track.style.setProperty("--marquee-pad", "0px");
              try { track.style.animation = 'none'; } catch (e) {}
              try { $face.removeData('marqueePending'); } catch (e) {}
            }
          } else {
            item1.innerHTML = "";
            $face.removeClass("is-marquee");
            track.style.setProperty("--marquee-shift", "0px");
            track.style.setProperty("--marquee-dur", "0s");
            track.style.setProperty("--marquee-delay", "0s");
            track.style.setProperty("--marquee-pad", "0px");
            try { track.style.animation = 'none'; } catch (e) {}
            try { $face.removeData('marqueePending'); } catch (e) {}
          }
        });
      } catch (e) {
        notifySafe(`applyMarquee failed for ${noticeWrapId}`, e);
      }
    };

    const clearMarqueeDelay = (name) => {
      try {
        if (!name) return;
        if (marqueeDelayTimers[name]) {
          clearTimeout(marqueeDelayTimers[name]);
          marqueeDelayTimers[name] = null;
        }
      } catch (e) { /* ignore */ }
    };

    const setNoticeHTML = (pattern, html) => {
      const next = pattern === "bonus" ? "bonus" : "target";
      const $faceItem = next === "bonus" ? $bonusItem : $targetItem;
      const $face = next === "bonus" ? $bonusFace : $targetFace;

      try {
        $faceItem.html(html);
        if (next === currentPattern) {
          refreshLayout(next, false);
          setTimeout(() => refreshLayout(next, false), 360);
          clearMarqueeDelay(next);
          // delay until width animation completes (260ms) to prevent layout shift
          setTimeout(() => {
            applyMarquee($face, true, 2);
          }, 260);
        } else {
          try {
            const w = calcDesiredWidth($face);
            $face.data('desiredWidth', w);
          } catch (e) { /* ignore */ }
          clearMarqueeDelay(next);
        }
      } catch (e) {
        notifySafe(`setNoticeHTML failed for ${noticeWrapId}`, e);
      }
    };

    const refreshLayout = (pattern, allowMarqueeStart = false) => {
      if (!allowMarqueeStart) {
        [$targetFace, $bonusFace].forEach(($f) => {
          try {
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
      applyMarquee(pattern === "bonus" ? $bonusFace : $targetFace, allowMarqueeStart, allowMarqueeStart ? 2 : 0);
    };

    const setNoticeTheme = (theme) => {
      if ($wrap.length === 0) return;
      const v = String(theme || "mid");
      $wrap.attr("data-theme", v);
    };

    const showNotice = (pattern, payload = {}) => {
      if ($wrap.length === 0 || $card.length === 0) {
        return;
      }
      const next = pattern === "bonus" ? "bonus" : "target";

      try {
        // set theme if provided
        if (payload.theme) setNoticeTheme(payload.theme);
        
        if (next === "target") {
          if (payload.html != null) setNoticeHTML('target', payload.html);
        } else {
          if (payload.html != null) setNoticeHTML('bonus', payload.html);
        }

        $wrap.addClass("is-visible");
        try {
          $wrap.css({opacity: '1', transform: 'scaleX(1)'});
        } catch (e) {}

        if (next !== currentPattern) {
          $card.toggleClass("is-flipped", next === "bonus");
          currentPattern = next;
        } else {
          $card.toggleClass("is-flipped", next === "bonus");
        }

        const $visibleFace = next === "bonus" ? $bonusFace : $targetFace;
        clearMarqueeDelay(next);

        const cached = $visibleFace.data('desiredWidth');
        if (typeof cached === 'number') {
          const cur = $wrap.width() || 0;
          if (Math.abs(cur - cached) >= 1) {
            $wrap.css('width', cached + 'px');
          }
          $visibleFace.removeData('desiredWidth');
        } else {
          refreshLayout(next, false);
        }
        setTimeout(() => refreshLayout(next, false), 360);

        clearMarqueeDelay(next);
          // delay until width animation completes (260ms) to prevent layout shift
          setTimeout(() => {
            applyMarquee($visibleFace, true, 2);
          }, 260);
      } catch (e) {
        notifySafe(`showNotice failed for ${noticeWrapId}`, e);
      }
    };

    const hideNotice = () => {
      if ($wrap.length === 0) return;
      try {
        $wrap.css({opacity: '0', transform: 'scaleX(0)'});
      } catch (e) { /* ignore */ }
      $wrap.removeClass("is-visible");
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

    return {
      showNotice,
      hideNotice,
      setNoticeTheme,
      setNoticeHTML,
      setNoticeText: (pattern, text) => setNoticeHTML(pattern, `<span class="notice__label">${String(text)}</span>`),
      refreshLayout: () => refreshLayout(currentPattern),
    };
  };

  // Create controllers for left and right notices
  const leftNoticeController = createNoticeController(
    'battleNoticeWrapLeft',
    'battleNoticeCardLeft',
    '#noticeTargetItemLeft',
    '#noticeBonusItemLeft',
    'noticeTargetItemLeft',
    'noticeBonusItemLeft'
  );

  const rightNoticeController = createNoticeController(
    'battleNoticeWrapRight',
    'battleNoticeCardRight',
    '#noticeTargetItemRight',
    '#noticeBonusItemRight',
    'noticeTargetItemRight',
    'noticeBonusItemRight'
  );

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
    // Left and right notice controllers
    leftNotice: leftNoticeController,
    rightNotice: rightNoticeController,
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

  const updateBarOverlayTop = () => {
    const $battle = $(".battle").first();
    const $bar = $(".battle__bar").first();
    if ($battle.length === 0 || $bar.length === 0) return;
    const top = $bar.position().top + $bar.outerHeight();
    $battle.get(0).style.setProperty("--bar-bottom", `${top}px`);
  };

  const updateBarSequenceSize = () => {
    if (barLeftPlayer && barLeftPlayer.resizeCanvas) {
      barLeftPlayer.resizeCanvas();
    }
    if (barRightPlayer && barRightPlayer.resizeCanvas) {
      barRightPlayer.resizeCanvas();
    }
  };

  updateBarOverlayTop();
  updateBarSequenceSize();

  // --- Resize: keep max 80% and marquee correct ---
  let resizeTimer = null;
  $(window).on("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      refreshLayout(currentPattern);
      updateBarOverlayTop();
      updateBarSequenceSize();
    }, 120);
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

      updateBarSequenceSize();
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

  $('#testBtn11').on('click', () => {
    window.BattleBarUI.leftNotice.showNotice("target", {html: "<span class='notice__label'>ミッション成功！</span>"});
  })

  $('#testBtn12').on('click', () => {
    window.BattleBarUI.rightNotice.showNotice("target", {html: "<span class='notice__label'>右側のテキスト</span>"});
  })

  // Left notice theme buttons
  $('#testBtn13').on('click', () => {
    window.BattleBarUI.leftNotice.setNoticeTheme("dark");
  })

  $('#testBtn14').on('click', () => {
    window.BattleBarUI.leftNotice.setNoticeTheme("mid");
  })

  $('#testBtn15').on('click', () => {
    window.BattleBarUI.leftNotice.setNoticeTheme("bright");
  })

  // Right notice theme buttons
  $('#testBtn16').on('click', () => {
    window.BattleBarUI.rightNotice.setNoticeTheme("dark");
  })

  $('#testBtn17').on('click', () => {
    window.BattleBarUI.rightNotice.setNoticeTheme("mid");
  })

  $('#testBtn18').on('click', () => {
    window.BattleBarUI.rightNotice.setNoticeTheme("bright");
  })

  $('#testBtn19').on('click', () => {
    window.BattleBarUI.leftNotice.showNotice("bonus", {html: "<span class='notice__label'>左側のテキスト</span>"});
  })

  $('#testBtn20').on('click', () => {
    window.BattleBarUI.rightNotice.showNotice("bonus", {html: "<span class='notice__label'>右側のテキスト</span>"});
  })

  $('#testBtn21').on('click', () => {
    window.BattleBarUI.leftNotice.hideNotice();
    window.BattleBarUI.rightNotice.hideNotice();
  })

  // テキストとテーマを同時に変更するデモ
  $('#testBtn22').on('click', () => {
    window.BattleBarUI.showNotice("target", {
      html: "<span class='notice__label'>テーマ付きテキスト</span>",
      theme: "dark"
    });
  })

  $('#testBtn23').on('click', () => {
    window.BattleBarUI.leftNotice.showNotice("target", {
      html: "<span class='notice__label'>左側：テーマ+テキスト</span>",
      theme: "bright"
    });
  })

  $('#testBtn24').on('click', () => {
    window.BattleBarUI.rightNotice.showNotice("bonus", {
      html: "<span class='notice__label'>右側：テーマ+テキスト</span>",
      theme: "mid"
    });
  })
  $('#testBtn25').on('click', () => {
    window.BattleBarUI.leftNotice.showNotice("bonus", {
      html: "<span class='notice__label'>春の雨がようやく上がった夕方、まだ水たまりが点々と残る</span>",
      theme: "bright"
    });
  })
  $('#testBtn26').on('click', () => {
    window.BattleBarUI.rightNotice.showNotice("bonus", {
      html: "<span class='notice__label'>春の雨がようやく上がった夕方、まだ水たまりが点々と残る</span>",
      theme: "bright"
    });
  })


  // ====== Video Player ======
  class VideoPlayer {
    constructor(videoId) {
      this.video = document.getElementById(videoId);
      if (this.video) {
        this.video.style.display = 'block';
        // Listen for video end and hide
        this.video.addEventListener('ended', () => {
          this.hide();
        });
      }
    }
    
    async play(videoPath) {
      try {
        if (!this.video) return;
        this.show();
        this.video.src = videoPath;
        this.video.load();
        
        // Attempt to play
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn(`${logPrefix} Video autoplay failed:`, error);
          });
        }
      } catch (e) {
        notifySafe('VideoPlayer.play failed', e);
      }
    }
    
    show() {
      if (this.video) {
        this.video.style.display = 'block';
      }
    }
    
    hide() {
      if (this.video) {
        this.video.style.opacity = '0';
        // Wait for fade-out to complete before stopping and hiding
        setTimeout(() => {
          if (this.video) {
            this.video.pause();
            this.video.currentTime = 0;
            this.video.style.display = 'none';
            this.video.style.opacity = '1';
          }
        }, 300);
      }
    }
    
    stop() {
      if (this.video) {
        this.video.pause();
        this.video.currentTime = 0;
        this.hide();
      }
    }
  }
  
  // Create video players
  const leftVideoPlayer = new VideoPlayer('videoLeft');
  const rightVideoPlayer = new VideoPlayer('videoRight');
  
  // Expose to global
  window.VideoPlayers = {
    left: leftVideoPlayer,
    right: rightVideoPlayer,
    playLeft: (videoPath) => {
      leftVideoPlayer.play(videoPath);
    },
    playRight: (videoPath) => {
      rightVideoPlayer.play(videoPath);
    },
    stopAll: () => {
      leftVideoPlayer.stop();
      rightVideoPlayer.stop();
    }
  };
  
  // Socket integration (when server is ready)
  if (socket) {
    // {side:"left"|"right", videoPath:"/path/to/video.mp4"}
    socket.on("battlebar:video", (p) => {
      try {
        const side = p.side === "right" ? "right" : "left";
        const player = side === "right" ? rightVideoPlayer : leftVideoPlayer;
        
        if (p.videoPath) {
          player.play(p.videoPath);
        }
      } catch (e) {
        notifySafe('Socket battlebar:video handler failed', e);
      }
    });
    
    // {side:"left"|"right"|"both"}
    socket.on("battlebar:video:stop", (p) => {
      try {
        if (p.side === "both" || !p.side) {
          leftVideoPlayer.stop();
          rightVideoPlayer.stop();
        } else if (p.side === "left") {
          leftVideoPlayer.stop();
        } else if (p.side === "right") {
          rightVideoPlayer.stop();
        }
      } catch (e) {
        notifySafe('Socket battlebar:video:stop handler failed', e);
      }
    });
  }

  // ====== Sequence Image Player ======
  class SequencePlayer {
    constructor(canvasId, audioId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.audio = document.getElementById(audioId);
      this.container = this.canvas ? this.canvas.parentElement : null;
      
      this.images = [];
      this.currentFrame = 0;
      this.isPlaying = false;
      this.fps = 30;
      this.frameInterval = 1000 / this.fps;
      this.lastFrameTime = 0;
      this.animationId = null;
      this.loop = false;
      this.isFading = false;
      
      this.folderPath = '';
      this.totalFrames = 0;
      this.audioPath = '';
      
      if (this.canvas) {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
      }
    }
    
    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
    
    async loadSequence(folderPath, totalFrames, audioPath = '', fps = 30) {
      try {
        this.folderPath = folderPath;
        this.totalFrames = totalFrames;
        this.audioPath = audioPath;
        this.fps = fps;
        this.frameInterval = 1000 / this.fps;
        this.images = [];
        this.currentFrame = 0;
        
        console.log(`${logPrefix} Loading sequence: ${folderPath}, frames: ${totalFrames}, fps: ${fps}`);
        
        // Preload images
        const loadPromises = [];
        for (let i = 1; i <= totalFrames; i++) {
          const frameNum = String(i).padStart(3, '0');
          const imagePath = `${folderPath}/${frameNum}.png`;
          
          const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ index: i - 1, img });
            img.onerror = () => {
              console.warn(`${logPrefix} Failed to load: ${imagePath}`);
              resolve({ index: i - 1, img: null });
            };
            img.src = imagePath;
          });
          
          loadPromises.push(promise);
        }
        
        const results = await Promise.all(loadPromises);
        results.forEach(({ index, img }) => {
          if (img) this.images[index] = img;
        });
        
        console.log(`${logPrefix} Loaded ${this.images.filter(img => img).length}/${totalFrames} frames`);
        
        // Load audio
        if (this.audio && audioPath) {
          this.audio.src = audioPath;
          this.audio.load();
        }
        
        return true;
      } catch (e) {
        notifySafe('loadSequence failed', e);
        return false;
      }
    }
    
    play(loop = false) {
      if (this.isPlaying || !this.images.length) return;
      
      this.isPlaying = true;
      this.loop = loop;
      this.currentFrame = 0;
      this.lastFrameTime = performance.now();
      
      // Play audio
      if (this.audio && this.audioPath) {
        this.audio.currentTime = 0;
        this.audio.play().catch(e => console.warn(`${logPrefix} Audio play failed:`, e));
      }
      
      this.animate(this.lastFrameTime);
    }
    
    animate(timestamp) {
      if (!this.isPlaying) return;
      
      const elapsed = timestamp - this.lastFrameTime;
      
      if (elapsed >= this.frameInterval) {
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);
        
        if (this.currentFrame < this.images.length) {
          this.drawFrame(this.currentFrame);
          this.currentFrame++;
        } else {
          if (this.loop) {
            // Loop: restart from frame 0
            this.currentFrame = 0;
            if (this.audio && this.audioPath) {
              this.audio.currentTime = 0;
            }
          } else {
            // No loop: stop
            this.stop();
            return;
          }
        }
      }
      
      this.animationId = requestAnimationFrame((t) => this.animate(t));
    }
    
    drawFrame(frameIndex) {
      if (!this.ctx || !this.images[frameIndex]) return;
      
      const img = this.images[frameIndex];
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Calculate aspect-fit positioning
      const canvasAspect = this.canvas.width / this.canvas.height;
      const imgAspect = img.width / img.height;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (canvasAspect > imgAspect) {
        drawHeight = this.canvas.height;
        drawWidth = img.width * (drawHeight / img.height);
        offsetX = (this.canvas.width - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = this.canvas.width;
        drawHeight = img.height * (drawWidth / img.width);
        offsetX = 0;
        offsetY = (this.canvas.height - drawHeight) / 2;
      }
      
      this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }
    
    stop() {
      this.isPlaying = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
      
      // Fade out effect
      if (this.canvas && this.container && !this.isFading) {
        this.isFading = true;
        this.canvas.style.opacity = '0';
        
        setTimeout(() => {
          if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
          this.canvas.style.opacity = '1';
          this.isFading = false;
        }, 300);
      }
    }
    
    setFPS(fps) {
      this.fps = fps;
      this.frameInterval = 1000 / this.fps;
    }
  }
  
  // Create players
  const leftPlayer = new SequencePlayer('canvasLeft', 'audioLeft');
  const rightPlayer = new SequencePlayer('canvasRight', 'audioRight');
  
  // Expose to global
  window.SequencePlayers = {
    left: leftPlayer,
    right: rightPlayer,
    playLeft: (folderPath, totalFrames, audioPath, fps = 30, loop = false) => {
      leftPlayer.loadSequence(folderPath, totalFrames, audioPath, fps).then(() => {
        leftPlayer.play(loop);
      });
    },
    playRight: (folderPath, totalFrames, audioPath, fps = 30, loop = false) => {
      rightPlayer.loadSequence(folderPath, totalFrames, audioPath, fps).then(() => {
        rightPlayer.play(loop);
      });
    },
    stopAll: () => {
      leftPlayer.stop();
      rightPlayer.stop();
    }
  };

  // ====== Bar Sequence Image Player ======
  class BarSequencePlayer {
    constructor(canvasId, containerId, folderPath, totalFrames) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.container = document.getElementById(containerId);

      this.images = [];
      this.currentFrame = 0;
      this.isPlaying = false;
      this.fps = 30;
      this.frameInterval = 1000 / this.fps;
      this.lastFrameTime = 0;
      this.animationId = null;
      this.loop = false;
      this.isFading = false;

      this.folderPath = folderPath;
      this.totalFrames = totalFrames;

      if (this.canvas) {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
      }
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }

    async loadSequence(folderPath, totalFrames, fps = 30) {
      try {
        this.folderPath = folderPath;
        this.totalFrames = totalFrames;
        this.fps = fps;
        this.frameInterval = 1000 / this.fps;
        this.images = [];
        this.currentFrame = 0;

        console.log(`${logPrefix} Loading bar sequence: ${folderPath}, frames: ${totalFrames}, fps: ${fps}`);

        const loadPromises = [];
        for (let i = 1; i <= totalFrames; i++) {
          const frameNum = String(i).padStart(3, '0');
          const imagePath = `${folderPath}/${frameNum}.png`;

          const promise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ index: i - 1, img });
            img.onerror = () => {
              console.warn(`${logPrefix} Failed to load: ${imagePath}`);
              resolve({ index: i - 1, img: null });
            };
            img.src = imagePath;
          });

          loadPromises.push(promise);
        }

        const results = await Promise.all(loadPromises);
        results.forEach(({ index, img }) => {
          if (img) this.images[index] = img;
        });

        console.log(`${logPrefix} Loaded ${this.images.filter(img => img).length}/${totalFrames} bar frames`);
        return true;
      } catch (e) {
        notifySafe('loadBarSequence failed', e);
        return false;
      }
    }

    play(loop = false) {
      if (this.isPlaying || !this.images.length) return;

      this.isPlaying = true;
      this.loop = loop;
      this.currentFrame = 0;
      this.lastFrameTime = performance.now();

      if (this.container) {
        this.container.classList.add('is-visible');
      }

      this.animate(this.lastFrameTime);
    }

    animate(timestamp) {
      if (!this.isPlaying) return;

      const elapsed = timestamp - this.lastFrameTime;

      if (elapsed >= this.frameInterval) {
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

        if (this.currentFrame < this.images.length) {
          this.drawFrame(this.currentFrame);
          this.currentFrame++;
        } else {
          if (this.loop) {
            this.currentFrame = 0;
          } else {
            this.stop();
            return;
          }
        }
      }

      this.animationId = requestAnimationFrame((t) => this.animate(t));
    }

    drawFrame(frameIndex) {
      if (!this.ctx || !this.images[frameIndex]) return;

      const img = this.images[frameIndex];
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Cover-style scaling for bar-only effect
      const scale = Math.max(
        this.canvas.width / img.width,
        this.canvas.height / img.height
      );
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const offsetX = (this.canvas.width - drawWidth) / 2;
      const offsetY = (this.canvas.height - drawHeight) / 2;

      this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }

    stop() {
      this.isPlaying = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }

      if (this.canvas && this.container && !this.isFading) {
        this.isFading = true;
        this.canvas.style.opacity = '0';

        setTimeout(() => {
          if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
          this.canvas.style.opacity = '1';
          this.container.classList.remove('is-visible');
          this.isFading = false;
        }, 300);
      }
    }

    setFPS(fps) {
      this.fps = fps;
      this.frameInterval = 1000 / this.fps;
    }
  }

  barLeftPlayer = new BarSequencePlayer(
    'barSeqCanvasLeft',
    'barSeqLeft',
    barSeqDefaults.folderPath,
    barSeqDefaults.totalFrames
  );
  barRightPlayer = new BarSequencePlayer(
    'barSeqCanvasRight',
    'barSeqRight',
    barSeqDefaults.folderPath,
    barSeqDefaults.totalFrames
  );

  updateBarSequenceSize();

  window.BarSequencePlayers = {
    left: barLeftPlayer,
    right: barRightPlayer,
    playLeft: (folderPath, totalFrames, fps = 30, loop = false) => {
      const path = folderPath || barSeqDefaults.left.folderPath;
      const frames = totalFrames || barSeqDefaults.left.totalFrames;
      barLeftPlayer.loadSequence(path, frames, fps).then(() => {
        barLeftPlayer.play(loop);
      });
    },
    playRight: (folderPath, totalFrames, fps = 30, loop = false) => {
      const path = folderPath || barSeqDefaults.right.folderPath;
      const frames = totalFrames || barSeqDefaults.right.totalFrames;
      barRightPlayer.loadSequence(path, frames, fps).then(() => {
        barRightPlayer.play(loop);
      });
    },
    stopLeft: () => barLeftPlayer.stop(),
    stopRight: () => barRightPlayer.stop(),
    stopAll: () => {
      barLeftPlayer.stop();
      barRightPlayer.stop();
    }
  };
  
  // Demo buttons
  $('#testSeqLeft30').on('click', () => {
    window.SequencePlayers.playLeft('/assets/video/WinTestVTR', 120, '', 30);
  });
  
  $('#testSeqLeft60').on('click', () => {
    window.SequencePlayers.playLeft('/assets/video/WinTestVTR', 120, '', 60);
  });

  $('#testSeqLeft30Loop').on('click', () => {
    window.SequencePlayers.playLeft('/assets/video/WinTestVTR', 120, '', 30, true);
  });

  $('#testSeqLeft60Loop').on('click', () => {
    window.SequencePlayers.playLeft('/assets/video/WinTestVTR', 120, '', 60, true);
  });
  
  $('#testSeqRight30').on('click', () => {
    window.SequencePlayers.playRight('/assets/video/LoseTestVTR', 120, '', 30);
  });
  
  $('#testSeqRight60').on('click', () => {
    window.SequencePlayers.playRight('/assets/video/LoseTestVTR', 120, '', 60);
  });

  $('#testSeqRight30Loop').on('click', () => {
    window.SequencePlayers.playRight('/assets/video/LoseTestVTR', 120, '', 30, true);
  });

  $('#testSeqRight60Loop').on('click', () => {
    window.SequencePlayers.playRight('/assets/video/LoseTestVTR', 120, '', 60, true);
  });
  
  $('#testSeqStop').on('click', () => {
    window.SequencePlayers.stopAll();
  });
  
  // Video demo buttons
  $('#testVideoLeft').on('click', () => {
    window.VideoPlayers.playLeft('/assets/storage/video/Gift02.mp4');
  });
  
  $('#testVideoRight').on('click', () => {
    window.VideoPlayers.playRight('/assets/storage/video/Gift02.mp4');
  });
  
  $('#testVideoStop').on('click', () => {
    window.VideoPlayers.stopAll();
  });

  $('#testLightningLeftOn').on('click', () => {
    window.BarSequencePlayers.playLeft(null, null, 30, true);
  });

  $('#testLightningLeftOff').on('click', () => {
    window.BarSequencePlayers.stopLeft();
  });

  $('#testLightningRightOn').on('click', () => {
    window.BarSequencePlayers.playRight(null, null, 30, true);
  });

  $('#testLightningRightOff').on('click', () => {
    window.BarSequencePlayers.stopRight();
  });
  
  // Socket integration (when server is ready)
  if (socket) {
    // {side:"left"|"right", folderPath:"/path/to/folder", totalFrames:120, audioPath:"/path/to/audio.mp3", fps:30, loop:false}
    socket.on("battlebar:sequence", (p) => {
      try {
        const side = p.side === "right" ? "right" : "left";
        const player = side === "right" ? rightPlayer : leftPlayer;
        const fps = p.fps || 30;
        const loop = p.loop || false;
        
        player.loadSequence(p.folderPath, p.totalFrames, p.audioPath || '', fps).then(() => {
          player.play(loop);
        });
      } catch (e) {
        notifySafe('Socket battlebar:sequence handler failed', e);
      }
    });
    
    // {side:"left"|"right"|"both"}
    socket.on("battlebar:sequence:stop", (p) => {
      try {
        if (p.side === "both" || !p.side) {
          leftPlayer.stop();
          rightPlayer.stop();
        } else if (p.side === "left") {
          leftPlayer.stop();
        } else if (p.side === "right") {
          rightPlayer.stop();
        }
      } catch (e) {
        notifySafe('Socket battlebar:sequence:stop handler failed', e);
      }
    });
  }
});