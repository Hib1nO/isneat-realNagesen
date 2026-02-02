// public/js/players-settings.js
$(function () {
  // =========================
  // 定数・要素
  // =========================
  const NO_IMAGE_URL = "/assets/img/NoImage.png";

  // PlayersStore が先に読み込まれている前提
  if (!window.PlayersStore || typeof window.PlayersStore.load !== "function") {
    console.error("[players-settings] PlayersStore is not found. Load players.js before this file.");
  }

  // Player settings panel
  const $playerListSelect = $("#playerSettingsPlayerList");
  const $reloadBtn = $("#playerSettingReloadBtn");
  const $playerNameInput = $("#playerSettingsPlayerName");

  // edit current player
  const $playerInput = $("#playerImageInput");
  const $playerImagePreview = $("#playerImagePreview");
  const $playerFileName = $("#playerImageFileName");
  const $removeImgBtn = $("#playerImgRemoveBtn");

  // buttons（players.pugでID付与している想定：付与していない場合でも動くように保険あり）
  const $saveBtn = $("#playerSaveBtn").length
    ? $("#playerSaveBtn")
    : $("#PlayersSettingsPanel .buttons .button.is-link").first();

  const $cancelBtn = $("#playerCancelBtn").length
    ? $("#playerCancelBtn")
    : $("#PlayersSettingsPanel .buttons .button").filter(function () {
        return $(this).text().trim() === "キャンセル";
      }).first();

  const $deleteBtn = $("#playerDeleteBtn");

  // New player modal（※ID重複対策で必ず new-player-model の中を探す）
  const $newModal = $("#new-player-model");
  const $newNameInput = $("#newPlayerNameInput").length
    ? $("#newPlayerNameInput")
    : $newModal.find("section.modal-card-body input.input.is-medium").first();

  const $newPlayerInput = $newModal.find("#NewplayerImageInput");
  const $newPlayerImagePreview = $newModal.find("#NewplayerImagePreview");
  const $newPlayerFileName = $newModal.find("#NewplayerImageFileName");

  const $newSaveBtn = $("#newPlayerSaveBtn").length
    ? $("#newPlayerSaveBtn")
    : $newModal.find("footer.modal-card-foot .buttons button.button.is-link").first();

  const $newCancelBtn = $("#newPlayerCancelBtn").length
    ? $("#newPlayerCancelBtn")
    : $newModal.find("footer.modal-card-foot .buttons button.modalcancell").first();

  // =========================
  // 状態：アイコン削除は「保存時に反映」
  // =========================
  let pendingIconDelete = false;

  // =========================
  // 通知
  // =========================
  function notifySafe(msg, opt) {
    if (typeof notify === "function") return notify(msg, opt);
    console.warn("[notify]", msg, opt);
  }

  // =========================
  // util
  // =========================
  function getSelectedPlayerId() {
    return $playerListSelect.val();
  }

  function closeNewModal() {
    $newModal.removeClass("is-active");
  }

  function resetNewModalFields() {
    $newNameInput.val("");
    $newPlayerInput.val("");
    if ($newPlayerFileName.length) $newPlayerFileName.text("");
    $newPlayerImagePreview.attr("src", NO_IMAGE_URL);
  }

  // 画像のキャッシュ対策（同じURLだと旧画像が出やすい）
  function withCacheBust(url) {
    const base = url && String(url).trim() ? url : NO_IMAGE_URL;
    const sep = base.includes("?") ? "&" : "?";
    return base + sep + "v=" + Date.now();
  }

  // =========================
  // API（ajax）
  // =========================
  function apiGetPlayer(playerId) {
    return $.ajax({
      url: "/api/players/" + encodeURIComponent(playerId),
      method: "GET",
      dataType: "json",
    }).then((data) => {
      if (!data || !data.ok) return $.Deferred().reject(data?.message || "player load failed").promise();
      return data.item;
    });
  }

  function apiUpdatePlayerMultipart(playerId, formData) {
    return $.ajax({
      url: "/api/players/" + encodeURIComponent(playerId),
      method: "PUT",
      data: formData,
      processData: false,
      contentType: false,
      dataType: "json",
    }).then((data) => {
      if (!data || !data.ok) return $.Deferred().reject(data?.message || "player update failed").promise();
      return data.item;
    });
  }

  function apiCreatePlayerMultipart(formData) {
    return $.ajax({
      url: "/api/players",
      method: "POST",
      data: formData,
      processData: false,
      contentType: false,
      dataType: "json",
    }).then((data) => {
      if (!data || !data.ok) return $.Deferred().reject(data?.message || "player create failed").promise();
      return data.item;
    });
  }

  function apiDeletePlayer(playerId) {
    return $.ajax({
      url: "/api/players/" + encodeURIComponent(playerId),
      method: "DELETE",
      dataType: "json",
    }).then((data) => {
      if (!data || !data.ok) {
        return $.Deferred().reject(data?.message || "player delete failed").promise();
      }
      return data;
    });
  }

  // =========================
  // UI反映
  // =========================
  function fillPlayerEditor(player) {
    $playerNameInput.val(player?.name ?? "");

    const url = player?.imageUrl ? player.imageUrl : NO_IMAGE_URL;
    $playerImagePreview.attr("src", withCacheBust(url));

    // ローカル選択状態はクリア
    $playerInput.val("");
    if ($playerFileName.length) $playerFileName.text("");

    // 切替時は削除予約解除
    pendingIconDelete = false;
  }

  // =========================
  // PlayersStoreで一覧ロード（select更新）
  // =========================
  function playersreload(force = false, selectPlayerId = null) {
    const before = getSelectedPlayerId();

    return window.PlayersStore.load(!!force)
      .done((players) => {
        const optionsHtml = window.PlayersStore.buildOptionsHtml(players);
        $playerListSelect.html(optionsHtml);

        // 優先順位：明示 > 以前 > 先頭
        let nextId = selectPlayerId || before || (players[0] && players[0].playerId);

        if (nextId) {
          $playerListSelect.val(nextId);
          $playerListSelect.trigger("change");
        } else {
          // データなしの場合はエディタを空に
          $playerNameInput.val("");
          $playerImagePreview.attr("src", NO_IMAGE_URL);
          $playerInput.val("");
          if ($playerFileName.length) $playerFileName.text("");
          pendingIconDelete = false;
        }
      })
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  }

  // =========================
  // 画像プレビュー（ファイル名反映込み）
  // =========================
  function bindImagePreview($input, $preview, $filename, onValidSelected) {
    $input.on("change", function () {
      const file = this.files && this.files[0];

      // 選択キャンセル
      if (!file) {
        if ($filename && $filename.length) $filename.text("");
        return;
      }

      // 画像以外は弾く
      if (!file.type || !file.type.match(/^image\//)) {
        notifySafe("画像ファイルを選択してください", { type: "warning", timeoutMs: 10000 });
        $(this).val("");
        if ($filename && $filename.length) $filename.text("");
        return;
      }

      // ✅ ファイル名を反映
      if ($filename && $filename.length) $filename.text(file.name);

      // ✅ 有効選択時のフック（編集側なら削除予約解除など）
      if (typeof onValidSelected === "function") onValidSelected(file);

      // プレビュー
      const reader = new FileReader();
      reader.onload = function (e) {
        $preview.attr("src", e.target.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // =========================
  // イベント：選択変更 → 詳細ロード
  // =========================
  $(document).on("change", "#playerSettingsPlayerList", function () {
    const playerId = $(this).val();
    if (!playerId) return;

    apiGetPlayer(playerId)
      .done((player) => {
        fillPlayerEditor(player);
      })
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  });

  // =========================
  // 更新ボタン：一覧再取得（force）
  // =========================
  $reloadBtn.on("click", function () {
    playersreload(true);
  });

  // =========================
  // アイコン削除：保存までサーバ反映しない（予約）
  // =========================
  $removeImgBtn.on("click", function () {
    pendingIconDelete = true;

    // UIだけ消す
    $playerImagePreview.attr("src", NO_IMAGE_URL);
    $playerInput.val("");
    if ($playerFileName.length) $playerFileName.text("");

    notifySafe("アイコン削除を予約しました（保存で反映）", { type: "info", timeoutMs: 3000 });
  });

  // =========================
  // 保存：名前＋画像 or 削除予約を反映
  // =========================
  function saveCurrentPlayer() {
    const playerId = getSelectedPlayerId();
    if (!playerId) return;

    const fd = new FormData();
    fd.append("name", $playerNameInput.val() || "");

    const file = $playerInput[0]?.files?.[0];

    if (file) {
      // 新しい画像があるなら優先
      fd.append("image", file);
    } else if (pendingIconDelete) {
      // 画像未選択＆削除予約 → 削除反映
      fd.append("imageUrl", "");
    }

    apiUpdatePlayerMultipart(playerId, fd)
      .done((updated) => {
        notifySafe("保存しました", { type: "success", timeoutMs: 3000 });

        // 保存したら予約解除
        pendingIconDelete = false;

        // 返却データで反映 → 一覧はPlayersStoreで強制更新
        fillPlayerEditor(updated);
        playersreload(true, playerId);
      })
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  }

  $saveBtn.on("click", function () {
    saveCurrentPlayer();
  });

  // キャンセル：サーバ状態に戻す
  $cancelBtn.on("click", function () {
    pendingIconDelete = false;
    const playerId = getSelectedPlayerId();
    if (!playerId) return;

    apiGetPlayer(playerId)
      .done(fillPlayerEditor)
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  });

  // =========================
  // 削除：DELETE
  // =========================
  $deleteBtn.on("click", function () {
    const playerId = getSelectedPlayerId();
    if (!playerId) return;

    const name = ($playerNameInput.val() || "").trim();
    const label = name ? `${name}（${playerId}）` : playerId;

    if (!window.confirm(`プレイヤーを削除します。\n\n対象: ${label}\n\nよろしいですか？`)) return;

    apiDeletePlayer(playerId)
      .done(() => {
        notifySafe("プレイヤーを削除しました", { type: "success", timeoutMs: 3000 });
        pendingIconDelete = false;

        // PlayersStoreキャッシュも更新したいので force でリロード
        playersreload(true);
      })
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  });

  // =========================
  // 新規プレイヤー作成（モーダル）
  // =========================
  function createNewPlayer() {
    const name = ($newNameInput.val() || "").trim();
    const file = $newPlayerInput[0]?.files?.[0] || null;

    const fd = new FormData();
    fd.append("name", name);
    if (file) fd.append("image", file);

    apiCreatePlayerMultipart(fd)
      .done((created) => {
        notifySafe("新規プレイヤーを作成しました", { type: "success", timeoutMs: 3000 });

        closeNewModal();
        resetNewModalFields();

        // 作成直後なので force で一覧更新し、新規IDを選択
        playersreload(true, created.playerId);
      })
      .fail((err) => {
        console.error(err);
        notifySafe(String(err), { type: "danger", timeoutMs: 10000 });
      });
  }

  $newSaveBtn.on("click", function () {
    createNewPlayer();
  });

  $newCancelBtn.on("click", function () {
    resetNewModalFields();
  });

  // =========================
  // 画像プレビュー：編集側は選択したら削除予約解除
  // =========================
  bindImagePreview($playerInput, $playerImagePreview, $playerFileName, function () {
    pendingIconDelete = false;
  });

  // 新規モーダル側（削除予約とは無関係）
  bindImagePreview($newPlayerInput, $newPlayerImagePreview, $newPlayerFileName);

  // =========================
  // 初期ロード（PlayersStore）
  // =========================
  playersreload(false);
});
