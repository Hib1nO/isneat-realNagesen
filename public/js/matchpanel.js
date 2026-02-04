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
  var cacheProp = Object.create(null);
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

  function setProp(idSelector, propName, next) {
    var key = "prop:" + idSelector + ":" + propName;
    var val = next;
    if (cacheProp[key] === val) return;

    var $el = $(idSelector);
    if (!$el.length) return;
    $el.prop(propName, val);
    cacheProp[key] = val;
  }

  function setDisabled(idSelector, disabled) {
    setProp(idSelector, "disabled", !!disabled);
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
  // Controls（ボタンの disabled 切替）
  // =========================
  function applyControlState(state) {
    var mp = !!(state && state.matchProcess === true);

    var timer = (state && state.timer) || {};
    var timerProcessing = timer.processing === true;
    var timerCount = toInt(timer.count, null);

    // match start
    setDisabled("#matchStartBtn", mp);

    // pause（timer.processing が true のときのみ押せる）
    setDisabled("#matchPauseBtn", !timerProcessing);

    // results display（試合終了: matchProcess=true, timer停止, count<=0 のときのみ表示可能）
    var canResults = mp && !timerProcessing && timerCount !== null && timerCount <= 0;
    setDisabled("#resultsDisplayBtn", !canResults);

    // last bonus
    var lb = (state && state.lastbounsprocess) || {};
    var lb01 = lb.player01 === true;
    var lb02 = lb.player02 === true;

    setDisabled("#player01LastBounsStartBtn", lb01);
    setDisabled("#player01LastBounsEndBtn", !lb01);
    setDisabled("#player02LastBounsStartBtn", lb02);
    setDisabled("#player02LastBounsEndBtn", !lb02);

    // sc start（autoStart=false かつ process=false のときのみ開始可能）
    var sc = (state && state.sc) || {};
    var canScStart = mp && sc.autoStart === false && sc.process === false;
    setDisabled("#scStartBtn", !canScStart);

    // sc success（ミッション時間が残っており、未成功のときのみ押せる）
    var missionSec = toInt(sc.missionSec, 0);
    var scProcessing = sc.process === true;
    var success = sc.success || {};

    var canScP01Success = scProcessing && missionSec > 0 && success.player01 === false;
    var canScP02Success = scProcessing && missionSec > 0 && success.player02 === false;

    setDisabled("#scPlayer01SuccessBtn", !canScP01Success);
    setDisabled("#scPlayer02SuccessBtn", !canScP02Success);
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

    // matchformatによる表示切替
    applyMatchFormat(matchFormat);

    // ボタン等の操作可否（disabled）
    applyControlState(state);

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
// UI -> Socket emit
// =========================
var UI_EVENT_NS = ".matchpanel";

function safeEmit(socket, eventName, payload) {
  try {
    if (!socket) throw new Error("socket が未初期化です");
    if (socket.connected !== true) {
      notifySafe("Socket.io 未接続です（送信はキューされる可能性があります）: " + eventName, { type: "warning", timeoutMs: 6000 });
      errorLog("[matchpanel] emit while disconnected:", eventName, payload || "");
    }
    log("[matchpanel] emit:", eventName, payload || "");
    socket.emit(eventName, payload);
  } catch (e) {
    errorLog("[matchpanel] emit error:", eventName, e, payload || "");
    notifySafe("送信エラー: " + eventName + " / " + (e && e.message ? e.message : e), { type: "danger", timeoutMs: 10000 });
  }
}

function readDeltaValue(selector) {
  try {
    var raw = $(selector).val();
    if (raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    if (!s) return null;

    // number input でも安全に Number 変換しておく（NaN の場合は文字列のまま送る）
    var n = Number(s);
    return isFinite(n) ? n : s;
  } catch (e) {
    errorLog("[matchpanel] readDeltaValue error:", selector, e);
    return null;
  }
}

function bindControls(socket) {
  try {
    // 試合タイマー
    $(document)
      .off("click" + UI_EVENT_NS, "#matchStartBtn")
      .on("click" + UI_EVENT_NS, "#matchStartBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "timer:start");
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#matchPauseBtn")
      .on("click" + UI_EVENT_NS, "#matchPauseBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "timer:pauseToggle");
      });

    // 確認ダイアログ付きリセット
    $(document)
      .off("click" + UI_EVENT_NS, "#matchResetBtn")
      .on("click" + UI_EVENT_NS, "#matchResetBtn", function (e) {
        e.preventDefault();
        try {
          var ok = window.confirm("試合をリセットします。よろしいですか？");
          if (!ok) return;
          safeEmit(socket, "match:reset");
        } catch (err) {
          errorLog("[matchpanel] matchResetBtn handler error:", err);
          notifySafe("試合リセット処理でエラーが発生しました", { type: "danger", timeoutMs: 10000 });
        }
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#scoreResetBtn")
      .on("click" + UI_EVENT_NS, "#scoreResetBtn", function (e) {
        e.preventDefault();
        try {
          var ok = window.confirm("スコアをリセットします。よろしいですか？");
          if (!ok) return;
          safeEmit(socket, "score:reset");
        } catch (err) {
          errorLog("[matchpanel] scoreResetBtn handler error:", err);
          notifySafe("スコアリセット処理でエラーが発生しました", { type: "danger", timeoutMs: 10000 });
        }
      });

    // スコア調整
    $(document)
      .off("click" + UI_EVENT_NS, "#scoreAdjustmentBtn")
      .on("click" + UI_EVENT_NS, "#scoreAdjustmentBtn", function (e) {
        e.preventDefault();

        try {
          var d1 = readDeltaValue("#player01ScoreAdjustmentInput");
          var d2 = readDeltaValue("#player02ScoreAdjustmentInput");

          if (d1 === null && d2 === null) {
            notifySafe("スコア調整を入力してください", { type: "warning", timeoutMs: 6000 });
            return;
          }

          if (d1 !== null) safeEmit(socket, "score:adjust", { player: "player01", delta: d1 });
          if (d2 !== null) safeEmit(socket, "score:adjust", { player: "player02", delta: d2 });
        } catch (err) {
          errorLog("[matchpanel] scoreAdjustmentBtn handler error:", err);
          notifySafe("スコア調整処理でエラーが発生しました", { type: "danger", timeoutMs: 10000 });
        }
      });

    // ラストボーナス
    $(document)
      .off("click" + UI_EVENT_NS, "#player01LastBounsStartBtn")
      .on("click" + UI_EVENT_NS, "#player01LastBounsStartBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "lastbonus:start", { player: "player01" });
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#player02LastBounsStartBtn")
      .on("click" + UI_EVENT_NS, "#player02LastBounsStartBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "lastbonus:start", { player: "player02" });
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#player01LastBounsEndBtn")
      .on("click" + UI_EVENT_NS, "#player01LastBounsEndBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "lastbonus:end", { player: "player01" });
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#player02LastBounsEndBtn")
      .on("click" + UI_EVENT_NS, "#player02LastBounsEndBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "lastbonus:end", { player: "player02" });
      });

    // SC
    $(document)
      .off("click" + UI_EVENT_NS, "#scStartBtn")
      .on("click" + UI_EVENT_NS, "#scStartBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "sc:start");
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#scPlayer01SuccessBtn")
      .on("click" + UI_EVENT_NS, "#scPlayer01SuccessBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "sc:success", { player: "player01" });
      });

    $(document)
      .off("click" + UI_EVENT_NS, "#scPlayer02SuccessBtn")
      .on("click" + UI_EVENT_NS, "#scPlayer02SuccessBtn", function (e) {
        e.preventDefault();
        safeEmit(socket, "sc:success", { player: "player02" });
      });

    log("[matchpanel] UI bindings registered");
  } catch (e) {
    errorLog("[matchpanel] bindControls error:", e);
    notifySafe("UIイベント登録に失敗しました: " + (e && e.message ? e.message : e), { type: "danger", timeoutMs: 10000 });
  }
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

    // UI events -> socket emit
    bindControls(socket);
  }

  // DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window, window.jQuery);
