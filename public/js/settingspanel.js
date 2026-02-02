(function () {
  function loadSettings() {
    return $.ajax({
      url: "/api/settings",
      method: "GET",
      dataType: "json"
    }).then(function (data) {
      if (!data || !data.ok) {
        return $.Deferred().reject(data?.message || "settings load failed").promise();
      }
      return data.settings || {};
    });
  }

  // Settingsタブ：共通プレイヤー候補 + selected 適用
  function renderSettingsPlayerSelects() {
    // players と settings を並列で取る
    $.when(PlayersStore.load(false), loadSettings())
      .then(function (players, settings) {
        const optionsHtml = PlayersStore.buildOptionsHtml(players);

        const $sels = $("#LeftPlayer01Select, #RightPlayer02Select, #LeftPlayer03Select, #LeftPlayer04Select");
        $sels.html(optionsHtml);

        // settingsの保存形式（例）
        // settings.matchPlayers = { left01: "<playerId>", right02: "<playerId>", left03: "<playerId>", right04: "<playerId>" }
        const mp = settings.matchPlayers || {};

        if (mp.left01) $("#LeftPlayer01Select").val(mp.left01);
        if (mp.right02) $("#RightPlayer02Select").val(mp.right02);
        if (mp.left03) $("#LeftPlayer03Select").val(mp.left03);
        if (mp.right04) $("#LeftPlayer04Select").val(mp.right04);
      })
      .fail(function (err) {
        console.error(err);
        if (window.toast) toast.error(String(err)); // toast.jsがある想定。無ければ消してください
      });
  }

  // 例：ページ初期化時に1回描画
  $(function () {
    renderSettingsPlayerSelects();
  });

  // タブ切り替え時に再描画したいなら、tab.js側からこれを呼べるようにしておく
  window.renderSettingsPlayerSelects = renderSettingsPlayerSelects;
})();
