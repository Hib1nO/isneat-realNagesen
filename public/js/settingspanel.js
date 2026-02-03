// public/js/settingspanel.js
(function () {
  "use strict";

  // =========================
  // Selectors
  // =========================
  const SEL_MATCH_FORMAT = "#MatchFormat";
  const SEL_P1 = "#LeftPlayer01Select";
  const SEL_P2 = "#RightPlayer02Select";
  const SEL_P3 = "#LeftPlayer03Select";
  const SEL_P4 = "#LeftPlayer04Select";
  const SEL_ALL_PLAYER_SELECTS = [SEL_P1, SEL_P2, SEL_P3, SEL_P4].join(", ");

  const BTN_RELOAD = "#matchFormatPlayersReload";
  const BTN_SAVE = "#matchFormatPlayersSave";
  const BTN_CANCEL = "#matchFormatPlayersCancel";

  // Players設定側（要件：Settings側更新時に Playersタブ一覧も更新）
  const SEL_PLAYERS_PANEL_LIST = "#playerSettingsPlayerList";
  const BTN_PLAYERS_PANEL_RELOAD = "#playerSettingReloadBtn";

  // =========================
  // Notify
  // =========================
  function notifySafe(message, opt) {
    try {
      if (typeof window.notify === "function") return window.notify(message, opt);
      const toastType = opt?.type === "danger" ? "error" : (opt?.type || "info");
      if (window.toast && typeof window.toast[toastType] === "function") {
        return window.toast[toastType](String(message));
      }
    } catch (_) {}
    console.log("[settingspanel]", message, opt || "");
  }

  // =========================
  // API
  // =========================
  function apiGetSettings() {
    return $.ajax({
      url: "/api/settings",
      method: "GET",
      dataType: "json",
    }).then(function (data) {
      if (!data || !data.ok) {
        return $.Deferred().reject(data?.message || "settings load failed").promise();
      }
      return data.settings || data;
    });
  }

  // 保存は matchsettings に行う（要件）
  function apiPutMatchSettings(matchSettings) {
    return $.ajax({
      url: "/api/matchsettings",
      method: "PUT",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify(matchSettings || {}),
    }).then(function (data) {
      if (!data || !data.ok) {
        return $.Deferred().reject(data?.message || "matchsettings save failed").promise();
      }
      return data.settings || matchSettings;
    });
  }

  // =========================
  // State
  // =========================
  let latestSettings = null; // 「キャンセルで戻す」基準
  let latestPlayers = [];

  // =========================
  // Utils
  // =========================
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function buildPlayerOptionsWithEmpty(players) {
    const empty = '<option value="">(未選択)</option>';
    const list =
      (window.PlayersStore && typeof window.PlayersStore.buildOptionsHtml === "function")
        ? window.PlayersStore.buildOptionsHtml(players)
        : "";
    return empty + list;
  }

  function hasOptionValue($select, value) {
    const v = String(value ?? "");
    if (!v) return true; // 空は許容
    return $select.find('option[value="' + v.replaceAll('"', '\\"') + '"]').length > 0;
  }

  // MatchFormat: value が無い（"1vs1"等）ケースも吸収
  function parseMatchFormat(val) {
    const s = String(val ?? "").trim();
    if (!s) return 1;
    if (s === "1" || s === "2") return Number(s);
    if (s.includes("2")) return 2; // "2vs2" 等
    return 1;
  }

  function setMatchFormatUI(matchformat) {
    const mf = parseMatchFormat(matchformat);
    const $sel = $(SEL_MATCH_FORMAT);
    if (!$sel.length) return;

    // まず value で合わせる（option(value="1") 等がある場合）
    $sel.val(String(mf));
    if ($sel.val() === String(mf)) return;

    // 次に text で合わせる（option に value 無い場合）
    const targetText = mf === 2 ? "2vs2" : "1vs1";
    const $opt = $sel.find("option").filter(function () {
      return $(this).text().trim() === targetText;
    }).first();

    if ($opt.length) {
      $sel.val($opt.val());
      return;
    }

    // 最後の保険：index
    $sel.prop("selectedIndex", mf === 2 ? 1 : 0);
  }

  function findPlayer(players, id) {
    if (!id) return null;
    const sid = String(id);
    return (players || []).find((p) => String(p.playerId) === sid) || null;
  }

  function toMatchPlayer(players, selectedId) {
    const id = selectedId ? String(selectedId) : "";
    if (!id) return { id: null, PlayerName: "", PlayerImg: null };
    const p = findPlayer(players, id);
    return {
      id,
      PlayerName: p?.name ? String(p.name) : "",
      PlayerImg: p?.imageUrl ? String(p.imageUrl) : null,
    };
  }

  function readUiMatchSettings(players) {
    const mfRaw = $(SEL_MATCH_FORMAT).val();
    return {
      matchformat: parseMatchFormat(mfRaw),
      matchplayers: {
        player01: toMatchPlayer(players, $(SEL_P1).val()),
        player02: toMatchPlayer(players, $(SEL_P2).val()),
        player03: toMatchPlayer(players, $(SEL_P3).val()),
        player04: toMatchPlayer(players, $(SEL_P4).val()),
      },
    };
  }

  // =========================
  // UI Apply / Update
  // =========================
  function applyServerToUi(settings, players) {
    latestSettings = settings || {};
    latestPlayers = players || [];

    // MatchFormat
    const mfSrc = latestSettings.matchformat ?? latestSettings.matchFormat;
    setMatchFormatUI(mfSrc);

    // Player selects: options + selected
    const optionsHtml = buildPlayerOptionsWithEmpty(latestPlayers);
    const $sels = $(SEL_ALL_PLAYER_SELECTS);
    $sels.html(optionsHtml);

    const mp = latestSettings.matchplayers || latestSettings.matchPlayers || {};
    $(SEL_P1).val(mp.player01?.id ? String(mp.player01.id) : "");
    $(SEL_P2).val(mp.player02?.id ? String(mp.player02.id) : "");
    $(SEL_P3).val(mp.player03?.id ? String(mp.player03.id) : "");
    $(SEL_P4).val(mp.player04?.id ? String(mp.player04.id) : "");
  }

  // Settingsページの「プレイヤー選択リスト」だけを更新（選択値は維持）
  function updateSettingsPlayerOptions(players) {
    if (!$(SEL_ALL_PLAYER_SELECTS).length) return;

    latestPlayers = players || [];

    const ids = [SEL_P1, SEL_P2, SEL_P3, SEL_P4];
    const current = ids.map((id) => $(id).val());

    const optionsHtml = buildPlayerOptionsWithEmpty(latestPlayers);
    $(ids.join(", ")).html(optionsHtml);

    // 選択復元（消えていたら空に）
    ids.forEach((id, i) => {
      const $sel = $(id);
      const v = current[i];
      if (!v) {
        $sel.val("");
        return;
      }
      if (hasOptionValue($sel, v)) $sel.val(v);
      else $sel.val("");
    });
  }

  // Playersパネル側から呼べるように公開（要件）
  window.settingsPanelUpdatePlayersOptions = updateSettingsPlayerOptions;

  // =========================
  // Load
  // =========================
  function reloadMatchFormatPlayers(forcePlayers) {
    if (!window.PlayersStore || typeof window.PlayersStore.load !== "function") {
      const msg = "PlayersStore が見つかりません（players.js の読み込み順を確認してください）";
      console.error("[settingspanel]", msg);
      notifySafe(msg, { type: "danger", timeoutMs: 10000 });
      return $.Deferred().reject(msg).promise();
    }

    return $.when(window.PlayersStore.load(!!forcePlayers), apiGetSettings())
      .then(function (players, settings) {
        applyServerToUi(settings, players);
        return { players, settings };
      })
      .fail(function (err) {
        console.error("[settingspanel] reload failed", err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  }

  // Playersタブ一覧も更新したい（要件）
  function refreshPlayersPanelList(forcePlayers) {
    try {
      if (typeof window.playersPanelReloadList === "function") {
        window.playersPanelReloadList(!!forcePlayers);
        return;
      }
    } catch (e) {
      console.warn("[settingspanel] playersPanelReloadList call failed", e);
    }

    // 予備：一覧selectが存在する場合だけ更新
    const $list = $(SEL_PLAYERS_PANEL_LIST);
    if (!$list.length) return;

    if (!window.PlayersStore || typeof window.PlayersStore.load !== "function") return;
    window.PlayersStore.load(!!forcePlayers)
      .done(function (players) {
        $list.html(window.PlayersStore.buildOptionsHtml(players));
      })
      .fail(function (err) {
        console.error("[settingspanel] refreshPlayersPanelList failed", err);
      });
  }

  // =========================
  // Sync: Players設定で追加/更新/削除されたら Settings側セレクトも更新
  // （playerspanel.js を触らなくても動くよう、ajaxSuccess を監視）
  // =========================
  function bindPlayersChangeSync() {
    $(document).on("ajaxSuccess", function (_evt, _xhr, ajaxSettings) {
      try {
        const url = String(ajaxSettings?.url || "");
        const type = String(ajaxSettings?.type || ajaxSettings?.method || "GET").toUpperCase();

        // /api/players, /api/players/:id の POST/PUT/DELETE の時だけ反応（GETは無視してループ防止）
        const isPlayersApi = url.startsWith("/api/players");
        const isMutation = type === "POST" || type === "PUT" || type === "DELETE";

        if (!isPlayersApi || !isMutation) return;

        if (!window.PlayersStore || typeof window.PlayersStore.load !== "function") return;

        window.PlayersStore.load(true)
          .done(function (players) {
            updateSettingsPlayerOptions(players);
          })
          .fail(function (err) {
            console.error("[settingspanel] sync players after mutation failed", err);
          });
      } catch (e) {
        console.warn("[settingspanel] ajaxSuccess hook error", e);
      }
    });

    // Reloadボタンは GET なので click で拾う（要件）
    $(document).on("click", BTN_PLAYERS_PANEL_RELOAD, function () {
      if (!window.PlayersStore || typeof window.PlayersStore.load !== "function") return;
      window.PlayersStore.load(true)
        .done(function (players) {
          updateSettingsPlayerOptions(players);
        })
        .fail(function (err) {
          console.error("[settingspanel] sync players on reload click failed", err);
        });
    });
  }

  // =========================
  // Events
  // =========================
  $(function () {
    // このファイルは全ページに読まれる可能性があるので、要素が無ければ何もしない
    if (!$(SEL_MATCH_FORMAT).length) {
      // Settingsページ以外でも、Players変更監視だけは動かしてOK（セレクトが無ければ updateが即return）
      bindPlayersChangeSync();
      return;
    }

    bindPlayersChangeSync();

    // 初回：サーバ設定 + プレイヤー一覧同期して反映
    reloadMatchFormatPlayers(true);

    // 更新：サーバ設定 + プレイヤー同期、Playersタブ一覧も更新
    $(document).on("click", BTN_RELOAD, function () {
      reloadMatchFormatPlayers(true).done(function () {
        refreshPlayersPanelList(true);
        notifySafe("更新しました", { type: "success", timeoutMs: 2000 });
      });
    });

    // 保存：/api/matchsettings に保存
    $(document).on("click", BTN_SAVE, function () {
      const payload = readUiMatchSettings(latestPlayers);

      apiPutMatchSettings(payload)
        .done(function (savedSettings) {
          // サーバが full settings を返す想定（返さなくてもOK）
          latestSettings = savedSettings || latestSettings;
          notifySafe("保存しました", { type: "success", timeoutMs: 2000 });

          // full settings が返る場合があるので再反映して整合
          if (latestSettings) applyServerToUi(latestSettings, latestPlayers);
        })
        .fail(function (err) {
          console.error("[settingspanel] save failed", err);
          notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
        });
    });

    // キャンセル：最後に取得したサーバ設定へ戻す
    $(document).on("click", BTN_CANCEL, function () {
      if (latestSettings) {
        applyServerToUi(latestSettings, latestPlayers);
        notifySafe("サーバ設定に戻しました", { type: "info", timeoutMs: 1500 });
      } else {
        reloadMatchFormatPlayers(true);
      }
    });
  });
})();
