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
    console.log("[settingspanel][notify]", message, opt || "");

    try {
      if (typeof window.notify === "function") return window.notify(message, opt);

      const toastType = opt?.type === "danger" ? "error" : (opt?.type || "info");
      if (window.toast && typeof window.toast[toastType] === "function") {
        return window.toast[toastType](String(message));
      }
    } catch (e) {
      console.warn("[settingspanel][notifySafe] notify failed", e);
    }
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
      });
    });

    // 保存：/api/matchsettings に保存
    $(document).on("click", BTN_SAVE, function () {
      const payload = readUiMatchSettings(latestPlayers);
      $(BTN_SAVE).addClass("is-loading");

      apiPutMatchSettings(payload)
        .done(function (savedSettings) {
          // サーバが full settings を返す想定（返さなくてもOK）
          latestSettings = savedSettings || latestSettings;
          $(BTN_SAVE).removeClass("is-loading");
          notifySafe("保存しました", { type: "success", timeoutMs: 2000 });

          // full settings が返る場合があるので再反映して整合
          if (latestSettings) applyServerToUi(latestSettings, latestPlayers);
        })
        .fail(function (err) {
          console.error("[settingspanel] save failed", err);
          $(BTN_SAVE).removeClass("is-loading");
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

    // =========================================================
    // Match Settings (timer/sc/gifts) - draft only until SAVE
    // =========================================================
    const BTN_MATCH_SETTINGS_RELOAD = "#matchSettingsReload";
    const BTN_MATCH_SETTINGS_SAVE = "#matchSettingsSave";
    const BTN_MATCH_SETTINGS_CANCEL = "#matchSettingsCancel";

    const IN_MATCH_MIN = "#matchTimeMinuteInput";
    const IN_MATCH_SEC = "#matchTimeSecondInput";

    const IN_SC_AUTOSTART_MIN = "#scAutoStartTimeMinuteInput";
    const IN_SC_AUTOSTART_SEC = "#scAutoStartTimeSecondInput";
    const IN_SC_NOTICE_MIN = "#scNoticeTimeMinuteInput";
    const IN_SC_NOTICE_SEC = "#scNoticeTimeSecondInput";
    const IN_SC_MISSION_MIN = "#scMissionTimeMinuteInput";
    const IN_SC_MISSION_SEC = "#scMissionTimeSecondInput";
    const IN_SC_BONUS_MIN = "#scBonusTimeMinuteInput";
    const IN_SC_BONUS_SEC = "#scBonusTimeSecondInput";

    const RADIO_SC_ON = "#scAutoStartOn";
    const RADIO_SC_OFF = "#scAutoStartOff";

    // 互換：古いIDが存在する場合も拾う
    const IN_SC_MAG = "#scMagnificationInput, #MagnificationInput";
    const IN_LAST_BONUS_MAG = "#lastBounsMagnificationInput, #lastBounsMagnificationInput";

    const TABLE_GIFT = "#giftListTable";
    const TBODY_GIFT = "#giftListBody";

    // Gift modals
    const MODAL_NEW_GIFT = "#new-gift-model";
    const MODAL_EDIT_GIFT = "#edit-gift-model";

    const IN_NEW_GIFT_ID = "#NewgiftId";
    const IN_NEW_GIFT_SCORE = "#NewgiftScore";
    const IN_NEW_GIFT_VIDEO = "#NewgiftVideoInput";
    const PRE_NEW_GIFT_VIDEO = "#NewgiftVideoPreview";
    const SPAN_NEW_GIFT_VIDEO_NAME = "#NewgiftVideoFileName";
    const BTN_NEW_GIFT_VIDEO_DEL = "#NewgiftVideoDeletBtn";
    const BTN_NEW_GIFT_ADD = "#NewgiftAddBtn";

    const IN_EDIT_GIFT_ID = "#giftEditId";
    const IN_EDIT_GIFT_SCORE = "#giftEditScore";
    const IN_EDIT_GIFT_VIDEO = "#giftEditVideoInput";
    const PRE_EDIT_GIFT_VIDEO = "#giftEditVideoPreview";
    const SPAN_EDIT_GIFT_VIDEO_NAME = "#giftEdifVideoFileName";
    const BTN_EDIT_GIFT_VIDEO_DEL = "#giftEditVideoDeletBtn";
    const BTN_EDIT_GIFT_SAVE = "#giftEditSaveBtn";
    const BTN_EDIT_GIFT_DELETE = "#giftEditDeletBtn";

    // draft state
    let serverSettings = null; // GET /api/settings の最新
    let draftSettings = null;  // UIで編集するドラフト（保存までサーバ反映しない）
    const pendingGiftVideos = new Map();   // giftId -> File
    const pendingGiftVideoDeletes = new Set(); // giftId

    function clampInt(n, min, max) {
      const x = Number(n);
      if (!Number.isFinite(x)) return min;
      return Math.min(max, Math.max(min, Math.trunc(x)));
    }

    function secondsToMS(sec) {
      const s = clampInt(sec, 0, 24 * 3600);
      return { m: Math.floor(s / 60), s: s % 60 };
    }

    function msToSeconds(min, sec) {
      return clampInt(min, 0, 9999) * 60 + clampInt(sec, 0, 59);
    }

    function getCheckedScAutoStart() {
      if ($(RADIO_SC_ON).is(":checked")) return true;
      if ($(RADIO_SC_OFF).is(":checked")) return false;
      // fallback: checked radio by name
      const v = $('input[name="scAutoStart"]:checked').val();
      return String(v) !== "0";
    }

    function setScAutoStartUI(flag) {
      const on = !!flag;
      if ($(RADIO_SC_ON).length) $(RADIO_SC_ON).prop("checked", on);
      if ($(RADIO_SC_OFF).length) $(RADIO_SC_OFF).prop("checked", !on);
    }

    function buildGiftRow(giftId, gift) {
      const score = Number(gift?.unitScore ?? 0);
      const videos = Array.isArray(gift?.effectVideos) ? gift.effectVideos : [];
      const hasVideo = videos.length > 0;
      const videoLabel = hasVideo ? "あり" : "なし";
      return `
        <tr data-gift-id="${String(giftId).replaceAll('"', "&quot;")}">
          <td>${giftId}</td>
          <td>${score}</td>
          <td>${videoLabel}</td>
          <td><button class="button is-small js-gift-edit" data-gift-id="${giftId}">変更</button></td>
        </tr>
      `;
    }

    function renderGiftTable() {
      if (!draftSettings) return;
      const gifts = draftSettings.gifts || {};
      const ids = Object.keys(gifts).sort();
      const html = ids.map((id) => buildGiftRow(id, gifts[id])).join("");
      if ($(TBODY_GIFT).length) {
        $(TBODY_GIFT).html(html);
      } else {
        // 保険：tbodyが無い場合は tfoot に入れる
        $(TABLE_GIFT).find("tfoot").html(html);
      }
    }

    function applyServerMatchSettingsToUI(s) {
      serverSettings = deepClone(s || {});
      draftSettings = deepClone(serverSettings || {});
      pendingGiftVideos.clear();
      pendingGiftVideoDeletes.clear();

      // timer
      const defSec = Number(draftSettings?.timer?.defaultSeconds ?? 0);
      const t = secondsToMS(defSec);
      $(IN_MATCH_MIN).val(t.m);
      $(IN_MATCH_SEC).val(t.s);

      // sc
      const sc = draftSettings.sc || {};
      const as = secondsToMS(Number(sc.autoStartTime ?? 0));
      $(IN_SC_AUTOSTART_MIN).val(as.m);
      $(IN_SC_AUTOSTART_SEC).val(as.s);

      const n = secondsToMS(Number(sc.noticeSeconds ?? 0));
      $(IN_SC_NOTICE_MIN).val(n.m);
      $(IN_SC_NOTICE_SEC).val(n.s);

      const mi = secondsToMS(Number(sc.missionSeconds ?? 0));
      $(IN_SC_MISSION_MIN).val(mi.m);
      $(IN_SC_MISSION_SEC).val(mi.s);

      const bo = secondsToMS(Number(sc.bonusSeconds ?? 0));
      $(IN_SC_BONUS_MIN).val(bo.m);
      $(IN_SC_BONUS_SEC).val(bo.s);

      setScAutoStartUI(!!sc.autoStart);

      $(IN_SC_MAG).first().val(Number(sc.scMagnification ?? 1));
      $(IN_LAST_BONUS_MAG).first().val(Number(draftSettings.lastBonusMagnification ?? 1));

      renderGiftTable();
    }

    function readUIIntoDraftSettings() {
      if (!draftSettings) draftSettings = {};

      // timer
      draftSettings.timer = draftSettings.timer || {};
      draftSettings.timer.defaultSeconds = msToSeconds($(IN_MATCH_MIN).val(), $(IN_MATCH_SEC).val());

      // sc
      draftSettings.sc = draftSettings.sc || {};
      draftSettings.sc.autoStartTime = msToSeconds($(IN_SC_AUTOSTART_MIN).val(), $(IN_SC_AUTOSTART_SEC).val());
      draftSettings.sc.noticeSeconds = msToSeconds($(IN_SC_NOTICE_MIN).val(), $(IN_SC_NOTICE_SEC).val());
      draftSettings.sc.missionSeconds = msToSeconds($(IN_SC_MISSION_MIN).val(), $(IN_SC_MISSION_SEC).val());
      draftSettings.sc.bonusSeconds = msToSeconds($(IN_SC_BONUS_MIN).val(), $(IN_SC_BONUS_SEC).val());
      draftSettings.sc.autoStart = getCheckedScAutoStart();

      const scMag = Number($(IN_SC_MAG).first().val());
      if (Number.isFinite(scMag)) draftSettings.sc.scMagnification = scMag;

      const lastMag = Number($(IN_LAST_BONUS_MAG).first().val());
      if (Number.isFinite(lastMag)) draftSettings.lastBonusMagnification = lastMag;

      // gifts は draftSettings で管理済み
      return draftSettings;
    }

    function apiPutSettingsFormData(settingsObj) {
      const fd = new FormData();
      fd.append("settings", JSON.stringify(settingsObj || {}));
      for (const [giftId, file] of pendingGiftVideos.entries()) {
        fd.append(`giftVideo_${giftId}`, file, file.name || `${giftId}.mp4`);
      }
      return $.ajax({
        url: "/api/settings",
        method: "PUT",
        data: fd,
        processData: false,
        contentType: false,
        dataType: "json"
      }).then(function (data) {
        if (!data || !data.ok) {
          return $.Deferred().reject(data?.message || "settings save failed").promise();
        }
        return data.settings || settingsObj;
      });
    }

    function isVideoFile(file) {
      return !!file && !!file.type && /^video\//.test(file.type);
    }

    function setVideoPreview($video, fileOrUrl) {
      if (!$video || !$video.length) return;
      try {
        if (!fileOrUrl) {
          $video.attr("src", "");
          $video.get(0)?.load?.();
          return;
        }
        if (typeof fileOrUrl === "string") {
          $video.attr("src", fileOrUrl);
          $video.get(0)?.load?.();
          return;
        }
        const url = URL.createObjectURL(fileOrUrl);
        $video.attr("src", url);
        $video.get(0)?.load?.();
      } catch (e) {
        console.warn("[settingspanel] setVideoPreview failed", e);
      }
    }

    // 初回：サーバ設定を読み込んでUI同期
    function reloadMatchSettingsFromServer() {
      return apiGetSettings()
        .done(function (s) {
          applyServerMatchSettingsToUI(s);
        })
        .fail(function (err) {
          console.error("[settingspanel] settings load failed", err);
          notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
        });
    }

    // 追加：Settings の「更新」
    $(document).on("click", BTN_MATCH_SETTINGS_RELOAD, function () {
      reloadMatchSettingsFromServer();
    });

    // 初回ロード（DOM ready 時点で呼ぶ）
    reloadMatchSettingsFromServer();

    // 保存：ここで初めてサーバ反映（ギフトの追加/変更/削除/動画もまとめて）
    $(document).on("click", BTN_MATCH_SETTINGS_SAVE, function () {
      try {
        $(BTN_MATCH_SETTINGS_SAVE).addClass('is-loading');
        const payload = readUIIntoDraftSettings();

        // gifts の「動画削除フラグ」は effectVideos=[] に反映しておく
        for (const gid of pendingGiftVideoDeletes.values()) {
          if (payload?.gifts?.[gid]) payload.gifts[gid].effectVideos = [];
        }

        apiPutSettingsFormData(payload)
          .done(function (saved) {
            notifySafe("保存しました", { type: "success", timeoutMs: 2000 });
            $(BTN_MATCH_SETTINGS_SAVE).removeClass('is-loading');
            applyServerMatchSettingsToUI(saved);
          })
          .fail(function (err) {
            console.error("[settingspanel] settings save failed", err);
            $(BTN_MATCH_SETTINGS_SAVE).removeClass('is-loading');
            notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
          });
      } catch (e) {
        console.error(e);
        $(BTN_MATCH_SETTINGS_SAVE).removeClass('is-loading');
        notifySafe("保存に失敗しました", { type: "danger", timeoutMs: 10000 });
      }
    });

    // キャンセル：サーバ設定に戻す（ドラフト破棄）
    $(document).on("click", BTN_MATCH_SETTINGS_CANCEL, function () {
      if (!serverSettings) return reloadMatchSettingsFromServer();
      applyServerMatchSettingsToUI(serverSettings);
      notifySafe("サーバ設定に戻しました", { type: "info", timeoutMs: 1500 });
    });

    // ========= Gift: New modal =========
    $(document).on("change", IN_NEW_GIFT_VIDEO, function () {
      const file = this.files && this.files[0];
      if (!file) return;

      if (!isVideoFile(file)) {
        notifySafe("動画ファイルを選択してください", { type: "warning", timeoutMs: 8000 });
        $(this).val("");
        return;
      }
      if ($(SPAN_NEW_GIFT_VIDEO_NAME).length) $(SPAN_NEW_GIFT_VIDEO_NAME).text(file.name);
      setVideoPreview($(PRE_NEW_GIFT_VIDEO), file);
    });

    $(document).on("click", BTN_NEW_GIFT_VIDEO_DEL, function () {
      $(IN_NEW_GIFT_VIDEO).val("");
      if ($(SPAN_NEW_GIFT_VIDEO_NAME).length) $(SPAN_NEW_GIFT_VIDEO_NAME).text("");
      setVideoPreview($(PRE_NEW_GIFT_VIDEO), null);
    });

    $(document).on("click", BTN_NEW_GIFT_ADD, function () {
      if (!draftSettings) draftSettings = deepClone(serverSettings || {});
      draftSettings.gifts = draftSettings.gifts || {};

      const giftId = String($(IN_NEW_GIFT_ID).val() || "").trim();
      const score = Number($(IN_NEW_GIFT_SCORE).val());

      if (!giftId) {
        notifySafe("ギフトIDを入力してください", { type: "warning", timeoutMs: 8000 });
        return;
      }
      if (draftSettings.gifts[giftId]) {
        notifySafe("同じギフトIDが既に存在します", { type: "warning", timeoutMs: 8000 });
        return;
      }
      if (!Number.isFinite(score) || score < 0) {
        notifySafe("加算スコアを正しく入力してください", { type: "warning", timeoutMs: 8000 });
        return;
      }

      const file = $(IN_NEW_GIFT_VIDEO).get(0)?.files?.[0] || null;

      draftSettings.gifts[giftId] = {
        unitScore: score,
        effectVideos: [] // 保存時に file があれば埋める
      };

      if (file) {
        if (!isVideoFile(file)) {
          notifySafe("動画ファイルを選択してください", { type: "warning", timeoutMs: 8000 });
          return;
        }
        pendingGiftVideos.set(giftId, file);
        pendingGiftVideoDeletes.delete(giftId);
        // UI上は「あり」表示にしたいのでダミーURLをセット
        draftSettings.gifts[giftId].effectVideos = ["(pending)"];
      }

      renderGiftTable();
      notifySafe("ギフトを追加しました（保存で反映）", { type: "info", timeoutMs: 2000 });

      // 入力リセット
      $(IN_NEW_GIFT_ID).val("");
      $(IN_NEW_GIFT_SCORE).val("");
      $(IN_NEW_GIFT_VIDEO).val("");
      if ($(SPAN_NEW_GIFT_VIDEO_NAME).length) $(SPAN_NEW_GIFT_VIDEO_NAME).text("");
      setVideoPreview($(PRE_NEW_GIFT_VIDEO), null);

      // モーダルを閉じる（bulma）
      $(MODAL_NEW_GIFT).removeClass("is-active");
    });

    // ========= Gift: Edit modal =========
    function openEditGiftModal(giftId) {
      if (!draftSettings?.gifts?.[giftId]) return;
      const g = draftSettings.gifts[giftId];

      $(IN_EDIT_GIFT_ID).val(giftId);
      $(IN_EDIT_GIFT_SCORE).val(Number(g.unitScore ?? 0));

      // 動画：draft の URL（サーバ保存済み） or pending file
      const pending = pendingGiftVideos.get(giftId);
      const url = Array.isArray(g.effectVideos) && g.effectVideos.length > 0 ? g.effectVideos[0] : "";
      if (pending) {
        if ($(SPAN_EDIT_GIFT_VIDEO_NAME).length) $(SPAN_EDIT_GIFT_VIDEO_NAME).text(pending.name);
        setVideoPreview($(PRE_EDIT_GIFT_VIDEO), pending);
      } else {
        if ($(SPAN_EDIT_GIFT_VIDEO_NAME).length) $(SPAN_EDIT_GIFT_VIDEO_NAME).text(url ? String(url).split("/").pop() : "");
        setVideoPreview($(PRE_EDIT_GIFT_VIDEO), url || null);
      }
      $(IN_EDIT_GIFT_VIDEO).val("");

      $(MODAL_EDIT_GIFT).addClass("is-active");
    }

    $(document).on("click", ".js-gift-edit", function () {
      const gid = String($(this).data("gift-id") || "").trim();
      if (!gid) return;
      openEditGiftModal(gid);
    });

    $(document).on("change", IN_EDIT_GIFT_VIDEO, function () {
      const file = this.files && this.files[0];
      if (!file) return;

      if (!isVideoFile(file)) {
        notifySafe("動画ファイルを選択してください", { type: "warning", timeoutMs: 8000 });
        $(this).val("");
        return;
      }
      if ($(SPAN_EDIT_GIFT_VIDEO_NAME).length) $(SPAN_EDIT_GIFT_VIDEO_NAME).text(file.name);
      setVideoPreview($(PRE_EDIT_GIFT_VIDEO), file);
    });

    $(document).on("click", BTN_EDIT_GIFT_VIDEO_DEL, function () {
      const gid = String($(IN_EDIT_GIFT_ID).val() || "").trim();
      if (!gid) return;

      // ドラフト上で削除（保存で反映）
      pendingGiftVideos.delete(gid);
      pendingGiftVideoDeletes.add(gid);

      if (draftSettings?.gifts?.[gid]) {
        draftSettings.gifts[gid].effectVideos = [];
      }

      $(IN_EDIT_GIFT_VIDEO).val("");
      if ($(SPAN_EDIT_GIFT_VIDEO_NAME).length) $(SPAN_EDIT_GIFT_VIDEO_NAME).text("");
      setVideoPreview($(PRE_EDIT_GIFT_VIDEO), null);

      notifySafe("ギフト動画を削除しました（保存で反映）", { type: "info", timeoutMs: 2000 });
      renderGiftTable();
    });

    $(document).on("click", BTN_EDIT_GIFT_SAVE, function () {
      const gid = String($(IN_EDIT_GIFT_ID).val() || "").trim();
      if (!gid || !draftSettings?.gifts?.[gid]) return;

      const score = Number($(IN_EDIT_GIFT_SCORE).val());
      if (!Number.isFinite(score) || score < 0) {
        notifySafe("加算スコアを正しく入力してください", { type: "warning", timeoutMs: 8000 });
        return;
      }

      draftSettings.gifts[gid].unitScore = score;

      const file = $(IN_EDIT_GIFT_VIDEO).get(0)?.files?.[0] || null;
      if (file) {
        if (!isVideoFile(file)) {
          notifySafe("動画ファイルを選択してください", { type: "warning", timeoutMs: 8000 });
          return;
        }
        pendingGiftVideos.set(gid, file);
        pendingGiftVideoDeletes.delete(gid);
        // UI上は「あり」表示にしたいのでダミー
        draftSettings.gifts[gid].effectVideos = ["(pending)"];
      }

      renderGiftTable();
      notifySafe("ギフトを更新しました（保存で反映）", { type: "info", timeoutMs: 2000 });
      $(MODAL_EDIT_GIFT).removeClass("is-active");
    });

    $(document).on("click", BTN_EDIT_GIFT_DELETE, function () {
      const gid = String($(IN_EDIT_GIFT_ID).val() || "").trim();
      if (!gid || !draftSettings?.gifts?.[gid]) return;

      delete draftSettings.gifts[gid];
      pendingGiftVideos.delete(gid);
      pendingGiftVideoDeletes.delete(gid);

      renderGiftTable();
      notifySafe("ギフトを削除しました（保存で反映）", { type: "info", timeoutMs: 2000 });
      $(MODAL_EDIT_GIFT).removeClass("is-active");
    });
  });
})();
