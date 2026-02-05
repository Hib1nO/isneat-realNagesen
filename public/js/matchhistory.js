/* public/assets/js/matchhistory.js
 * 役割:
 * - /api/matches から全件取得して #matchHistory（tbody#matchHistoryBody）へ描画
 * - window.matchHistoryReload() を公開（matchpanel.js から呼び出し可能）
 */
(function (window, $) {
  "use strict";

  var MODULE = "[matchhistory]";
  var API_PATH = "/api/matches";
  var PAGE_SIZE = 200; // api.js の default(limit=50) を上書きしつつ、全件取得のためにページングする

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(MODULE);
      console.log.apply(console, args);
    } catch (_) {}
  }

  function errorLog() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(MODULE);
      console.error.apply(console, args);
    } catch (_) {}
  }

  // toast.js の notify() があればそれを使い、なければ alert にフォールバック
  function notifySafe(message, opts) {
    try {
      if (typeof window.notify === "function") return window.notify(message, opts || {});
      if (typeof window.notifySafe === "function") return window.notifySafe(message, opts || {});
    } catch (e) {
      // no-op
    }
    try {
      alert(message);
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(n) {
    var x = Number(n);
    if (!isFinite(x)) return "00";
    return x < 10 ? "0" + x : String(x);
  }

  function formatDateTime(ms) {
    var t = Number(ms);
    if (!isFinite(t) || t <= 0) return "なし";
    var d = new Date(t);
    // YYYY/MM/DD HH:mm:ss
    var y = d.getFullYear();
    var mo = pad2(d.getMonth() + 1);
    var da = pad2(d.getDate());
    var hh = pad2(d.getHours());
    var mm = pad2(d.getMinutes());
    var ss = pad2(d.getSeconds());
    return y + "/" + mo + "/" + da + " " + hh + ":" + mm + ":" + ss;
  }

  function formatNumber(v) {
    if (v === null || v === undefined) return "0";
    var n = Number(v);
    if (isFinite(n)) return n.toLocaleString("ja-JP");
    return String(v);
  }

  function joinNamesLineBreak(a, b) {
    var s1 = String(a ?? "").trim();
    var s2 = String(b ?? "").trim();
    if (!s1 && !s2) return "なし";
    if (s1 && s2) return escapeHtml(s1) + "<br>" + escapeHtml(s2);
    return escapeHtml(s1 || s2);
  }

  async function fetchJson(url) {
    var res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  async function fetchAllMatches() {
    var all = [];
    var skip = 0;

    // 無限ループ防止（想定外の API 動作でも固まらないように）
    var safety = 0;
    while (true) {
      safety += 1;
      if (safety > 1000) throw new Error("pagination safety stop");

      var url = API_PATH + "?limit=" + PAGE_SIZE + "&skip=" + skip;
      var data = await fetchJson(url);

      if (!data || data.ok !== true) {
        var msg = (data && data.message) ? data.message : "API returned not ok";
        throw new Error(msg);
      }

      var items = Array.isArray(data.items) ? data.items : [];
      all = all.concat(items);

      if (items.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    return all;
  }

  function buildRowHtml(item) {
    var mp = item && item.matchplayers ? item.matchplayers : {};
    var total = item && item.total ? item.total : {};

    var matchformat = Number(item && item.matchformat);
    var leftName, rightName;

    if (matchformat === 2) {
      leftName = joinNamesLineBreak(mp.player01 && mp.player01.PlayerName, mp.player03 && mp.player03.PlayerName);
      rightName = joinNamesLineBreak(mp.player02 && mp.player02.PlayerName, mp.player04 && mp.player04.PlayerName);
    } else {
      // 1 を含むそれ以外は 1扱い（壊れないように）
      leftName = joinNamesLineBreak(mp.player01 && mp.player01.PlayerName, null);
      rightName = joinNamesLineBreak(mp.player02 && mp.player02.PlayerName, null);
    }

    var dt = formatDateTime(item && item.endedAt);
    var state = escapeHtml(String((item && item.matchstate) ?? "なし"));
    var leftScore = formatNumber(total.player01);
    var rightScore = formatNumber(total.player02);

    return (
      '<tr>' +
      "<td>" + escapeHtml(dt) + "</td>" +
      "<td>" + state + "</td>" +
      "<td>" + leftName + "</td>" +
      "<td>" + escapeHtml(leftScore) + "</td>" +
      "<td>" + rightName + "</td>" +
      "<td>" + escapeHtml(rightScore) + "</td>" +
      "</tr>"
    );
  }

  function setStatusRow($tbody, message) {
    if (!$tbody || !$tbody.length) return;
    $tbody.html('<tr><td colspan="6">' + escapeHtml(message) + "</td></tr>");
  }

  var lastReqId = 0;
  function reloadMatchHistory(opts) {
    opts = opts || {};
    var delayMs = Number(opts.delayMs ?? 0);
    if (isFinite(delayMs) && delayMs > 0) {
      window.setTimeout(function () {
        reloadMatchHistory({ delayMs: 0 });
      }, delayMs);
      return;
    }

    var reqId = ++lastReqId;
    var $tbody = $("#matchHistoryBody");
    if (!$tbody.length) {
      // 互換: もし tbody が無い場合は tfoot を使う（旧HTML向け）
      $tbody = $("#matchHistory tfoot");
    }
    if (!$tbody.length) return;

    setStatusRow($tbody, "読み込み中...");

    fetchAllMatches()
      .then(function (items) {
        if (reqId !== lastReqId) return; // 古いリクエスト結果は捨てる
        if (!Array.isArray(items) || items.length === 0) {
          setStatusRow($tbody, "データなし");
          return;
        }

        // endedAt の降順（最新が上）
        items.sort(function (a, b) {
          var ta = Number(a && a.endedAt) || 0;
          var tb = Number(b && b.endedAt) || 0;
          return tb - ta;
        });

        var html = items.map(buildRowHtml).join("");
        $tbody.html(html);
      })
      .catch(function (err) {
        if (reqId !== lastReqId) return;
        errorLog("match history fetch/render error:", err);
        notifySafe(
          "試合履歴の取得に失敗しました: " + (err && err.message ? err.message : err),
          { type: "danger", timeoutMs: 10000 }
        );
        setStatusRow($tbody, "取得に失敗しました");
      });
  }

  // 外部（matchpanel.js）から呼ぶために公開
  window.matchHistoryReload = reloadMatchHistory;

  // 初期表示
  $(function () {
    reloadMatchHistory();
  });
})(window, window.jQuery);
