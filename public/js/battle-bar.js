// battle-bar.js (jQuery版)
// - Timer + Notice UI (2 patterns)
// - Width auto animation + overflow marquee
// - Pattern switch: vertical flip (rotateX)

$(function () {
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

  const getMaxNoticeWidth = () => Math.floor($(window).width() * 0.8);

  const calcDesiredWidth = ($face) => {
    try {
      const el = $face.find(".noticeFace__content").get(0);
      if (!el) return getMaxNoticeWidth();
      const needed = el.scrollWidth;
      const min = 260;
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
    $noticeWrap.css("width", w + "px");
  };

  const applyMarquee = ($face) => {
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

        const gap = 34; // sync with CSS gap
        if (contentW > containerW + 2) {
          // duplicate for seamless loop (only when needed)
          item1.innerHTML = item0.innerHTML;
          $face.addClass("is-marquee");

          const shift = contentW + gap;
          const pxPerSec = 70;
          const dur = Math.max(8, shift / pxPerSec);
          track.style.setProperty("--marquee-shift", shift + "px");
          track.style.setProperty("--marquee-dur", dur + "s");
        } else {
          // no overflow -> no duplicate
          item1.innerHTML = "";
          $face.removeClass("is-marquee");
          track.style.setProperty("--marquee-shift", "0px");
          track.style.setProperty("--marquee-dur", "0s");
        }
      });
    } catch (e) {
      notifySafe("applyMarquee failed", e);
    }
  };

  const refreshLayout = (pattern) => {
    applyWidth(pattern);
    applyMarquee(pattern === "bonus" ? $bonusFace : $targetFace);
  };

  const setNoticeTheme = (theme) => {
    if ($noticeWrap.length === 0) return;
    const v = String(theme || "mid");
    $noticeWrap.attr("data-theme", v);
  };

  const showNotice = (pattern, payload = {}) => {
    if ($noticeWrap.length === 0 || $noticeCard.length === 0) return;
    const next = pattern === "bonus" ? "bonus" : "target";

    try {
      // content update (color switch is cut, per requirement)
      if (next === "target") {
        if (payload.count != null) $targetCount.text(String(payload.count));
        if (payload.html != null) $targetItem.html(payload.html);
      } else {
        if (payload.seconds != null) $bonusSec.text(String(payload.seconds));
        if (payload.html != null) $bonusItem.html(payload.html);
      }

      // show animation: expand from center
      $noticeWrap.addClass("is-visible");

      // flip if pattern changed
      if (next !== currentPattern) {
        $noticeCard.toggleClass("is-flipped", next === "bonus");
        currentPattern = next;
      } else {
        // still ensure correct side state
        $noticeCard.toggleClass("is-flipped", next === "bonus");
      }

      // after flip starts, adjust width/marquee for the currently visible face
      // (flip duration is CSS controlled; we can refresh immediately + after a short delay)
      refreshLayout(next);
      setTimeout(() => refreshLayout(next), 360);
    } catch (e) {
      notifySafe("showNotice failed", e);
    }
  };

  const hideNotice = () => {
    if ($noticeWrap.length === 0) return;
    // fade out
    $noticeWrap.removeClass("is-visible");
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
});
