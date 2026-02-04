(function (window, $) {
  "use strict";

  // =========================
  // Config
  // =========================
  var NAMESPACE = "/admin";
  var DEFAULT_NO_IMAGE = "/assets/img/NoImage.png"; // 必要なら差し替えてください
  var DEBUG = true;

  // =========================
  // Logger
  // =========================
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, arguments); } catch (e) {}
  }

  function errorLog() {
    try { console.error.apply(console, arguments); } catch (e) {}
  }

  // =========================
  // 通知（例外時：ログ＋通知）
  // =========================
  function notifySafe(msg, opt) {
    console.log("[matchpanel][notify]", msg, opt || "");

    try {
      if (typeof window.notify === "function") return window.notify(msg, opt);
    } catch (e) {
      console.warn("[matchpanel][notifySafe] notify failed", e);
    }

    console.warn("[matchpanel][notify] notify() not found", msg, opt);
  }

  // =========================
  // Utils
  // =========================
  function toInt(v, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return n;
  }

  function safeStr(v, fallback) {
    if (v === null || v === undefined) return fallback;
    return String(v);
  }

  function formatMMSS(sec) {
    var s = toInt(sec, null);
    if (s === null) return "--:--";
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return String(m) + ":" + String(ss).padStart(2, "0");
  }

  function resolveImgPath(p) {
    var s = safeStr(p, "").trim();
    return s ? s : DEFAULT_NO_IMAGE;
  }

  function escapeHtml(s) {
    return safeStr(s, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function joinNamesWithBr(nameA, nameB) {
    var a = safeStr(nameA, "").trim();
    var b = safeStr(nameB, "").trim();
    if (!a && !b) return "";
    if (a && !b) return escapeHtml(a);
    if (!a && b) return escapeHtml(b);
    return escapeHtml(a) + "<br>" + escapeHtml(b);
  }

  // =========================
  // DOM Diff Updater（JS側キャッシュで差分更新）
  // =========================
  var cacheText = Object.create(null);
  var cacheAttr = Object.create(null);
  var cacheHtml = Object.create(null);
  var lastMatchFormat = null;

  function setText(idSelector, next) {
    var key = "text:" + idSelector;
    var val = safeStr(next, "");
    if (cacheText[key] === val) return;

    var $el = $(idSelector);
    if (!$el.length) return; // 対象が無い場合は無視（拡張性のため）
    $el.text(val);
    cacheText[key] = val;
  }

  function setHtml(idSelector, nextHtml) {
    var key = "html:" + idSelector;
    var val = safeStr(nextHtml, "");
    if (cacheHtml[key] === val) return;

    var $el = $(idSelector);
    if (!$el.length) return;
    $el.html(val);
    cacheHtml[key] = val;
  }

  function setAttr(idSelector, attrName, next) {
    var key = "attr:" + idSelector + ":" + attrName;
    var val = safeStr(next, "");
    if (cacheAttr[key] === val) return;

    var $el = $(idSelector);
    if (!$el.length) return;
    $el.attr(attrName, val);
    cacheAttr[key] = val;
  }

  // =========================
  // matchformat に応じた表示切替（class操作）
  //  - format=1（solo）
  //    - #player01ImgFigure,#player02ImgFigure: PlalayerImage-solo を付与
  //    - #player03ImgFigure,#player04ImgFigure: nondisplay を付与
  //  - format=2（duo）
  //    - #player01ImgFigure,#player02ImgFigure: solo→duo に変更
  //    - #player03ImgFigure,#player04ImgFigure: nondisplay を削除
  // =========================
  function applyMatchFormat(matchFormat) {
    if (matchFormat === null || matchFormat === undefined) return;

    var mf = toInt(matchFormat, null);
    if (mf === null) return;

    if (mf === lastMatchFormat) return; // 変化が無いならclass操作はしない
    lastMatchFormat = mf;

    var $p01 = $("#player01ImgFigure");
    var $p02 = $("#player02ImgFigure");
    var $p03 = $("#player03ImgFigure");
    var $p04 = $("#player04ImgFigure");

    if (mf === 1) {
      $p01.removeClass("PlalayerImage-duo").addClass("PlalayerImage-solo");
      $p02.removeClass("PlalayerImage-duo").addClass("PlalayerImage-solo");

      $p03.addClass("nondisplay");
      $p04.addClass("nondisplay");
      return;
    }

    if (mf === 2) {
      $p01.removeClass("PlalayerImage-solo").addClass("PlalayerImage-duo");
      $p02.removeClass("PlalayerImage-solo").addClass("PlalayerImage-duo");

      $p03.removeClass("nondisplay");
      $p04.removeClass("nondisplay");
      return;
    }

    // 想定外の値
    console.warn("[matchpanel] unknown matchformat:", matchFormat);
  }

  // =========================
  // State -> DOM
  // 受信state（例）に合わせて参照先を更新
  // =========================
  function applyState(state) {
    // state構造（例）
    // state.timer.count
    // state.matchsettings.matchformat
    // state.matchsettings.matchplayers.player01...
    // state.score.player01 / player02 / score.magnification.player01 ...
    // state.sc.noticeSec ...

    var timerCount = state && state.timer && state.timer.count;
    var sc = state && state.sc;

    var matchsettings = state && state.matchsettings;
    var matchFormat = matchsettings && matchsettings.matchformat;
    var players = matchsettings && matchsettings.matchplayers;

    var score = state && state.score;
    var mag = score && score.magnification;

    console.log(score)

    // matchformatによる表示切替
    applyMatchFormat(matchFormat);

    // Timers (秒 -> m:ss)
    setText("#matchTimer", formatMMSS(timerCount));
    setText("#scNoticeTimer", formatMMSS(sc && sc.noticeSec));
    setText("#scMissionTimer", formatMMSS(sc && sc.missionSec));
    setText("#SCBonusTimerPlayer01", formatMMSS(sc && sc.player01BonusSec));
    setText("#SCBonusTimerPlayer02", formatMMSS(sc && sc.player02BonusSec));

    // Player images (src)
    setAttr("#player01img", "src", resolveImgPath(players && players.player01 && players.player01.PlayerImg));
    setAttr("#player02img", "src", resolveImgPath(players && players.player02 && players.player02.PlayerImg));
    setAttr("#player03img", "src", resolveImgPath(players && players.player03 && players.player03.PlayerImg));
    setAttr("#player04img", "src", resolveImgPath(players && players.player04 && players.player04.PlayerImg));

    // Player names
    var p01Name = players && players.player01 && players.player01.PlayerName;
    var p02Name = players && players.player02 && players.player02.PlayerName;
    var p03Name = players && players.player03 && players.player03.PlayerName;
    var p04Name = players && players.player04 && players.player04.PlayerName;

    var mf = toInt(matchFormat, 1);

    // 03/04は存在するなら常に同期（表示に使わなくても“最新値”を保つ）
    setText("#player03Name", safeStr(p03Name, ""));
    setText("#player04Name", safeStr(p04Name, ""));

    // 01/02は matchformat に応じて表示内容を切替
    if (mf === 2) {
      setHtml("#player01Name", joinNamesWithBr(p01Name, p03Name));
      setHtml("#player02Name", joinNamesWithBr(p02Name, p04Name));
    } else {
      // mf === 1（solo想定）
      setHtml("#player01Name", escapeHtml(p01Name));
      setHtml("#player02Name", escapeHtml(p02Name));
    }

    // Score (01/02)
    setText("#player01Score", safeStr(score && score.player01, "0"));
    setText("#player02Score", safeStr(score && score.player02, "0"));

    // Magnification (01/02)
    setText("#player01NowMagnification", safeStr(mag && mag.player01, "1"));
    setText("#player02NowMagnification", safeStr(mag && mag.player02, "1"));
  }

  // =========================
  // Socket.io
  // =========================
  function start() {
    if (!$) {
      errorLog("[matchpanel] jQuery not found.");
      notifySafe("jQuery が見つかりません（matchpanel.js）", { type: "danger", timeoutMs: 10000 });
      return;
    }
    if (!window.io) {
      errorLog("[matchpanel] socket.io client (io) not found.");
      notifySafe("socket.io-client が見つかりません（matchpanel.js）", { type: "danger", timeoutMs: 10000 });
      return;
    }

    var socket;
    try {
      socket = window.io(NAMESPACE, { transports: ["websocket", "polling"] });
    } catch (e) {
      errorLog("[matchpanel] socket init error:", e);
      notifySafe("Socket.io 初期化に失敗しました: " + (e && e.message ? e.message : e), { type: "danger", timeoutMs: 10000 });
      return;
    }

    socket.on("connect", function () {
      log("[matchpanel] connected:", socket.id);
    });

    socket.on("connect_error", function (err) {
      errorLog("[matchpanel] connect_error:", err);
      notifySafe("Socket.io 接続エラー: " + (err && err.message ? err.message : err), { type: "danger", timeoutMs: 10000 });
    });

    socket.on("disconnect", function (reason) {
      errorLog("[matchpanel] disconnected:", reason);
      notifySafe("Socket.io 切断: " + reason, { type: "warning", timeoutMs: 10000 });
    });

    function handleState(kind, payload) {
      try {
        if (!payload || typeof payload !== "object") {
          throw new Error(kind + " の payload が不正です");
        }
        applyState(payload);
      } catch (e) {
        errorLog("[matchpanel] state handler error:", e, payload);
        notifySafe("state反映エラー: " + (e && e.message ? e.message : e), { type: "warning", timeoutMs: 10000 });
      }
    }

    socket.on("state:init", function (payload) {
      handleState("state:init", payload);
    });

    socket.on("state:update", function (payload) {
      handleState("state:update", payload);
    });
  }

  // DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window, window.jQuery);
