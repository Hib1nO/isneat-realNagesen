$(function () {
  const $Newplayerinput   = $('#NewplayerImageInput');      // <input type="file" ...>
  const $NewplayerImagepreview = $('#NewplayerImagePreview');    // <img ...>
  const $Newplayername    = $('#NewplayerImageFileName');   // （任意）<span class="file-name" ...>

  $Newplayerinput.on('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;

    // 画像以外は弾く
    if (!file.type || !file.type.match(/^image\//)) {
      notify("画像ファイルを選択してください", { type: "warning", timeoutMs: 10000 });
      $(this).val('');
      return;
    }

    // （任意）ファイル名表示を更新
    if ($Newplayername.length) $Newplayername.text(file.name);

    // 画像プレビュー
    const reader = new FileReader();
    reader.onload = function (e) {
      $NewplayerImagepreview.attr('src', e.target.result);
    };
    reader.readAsDataURL(file);
  });

  const $playerinput   = $('#playerImageInput');      // <input type="file" ...>
  const $playerImagepreview = $('#playerImagePreview');    // <img ...>
  const $playername    = $('#playerImageFileName');   // （任意）<span class="file-name" ...>

  $playerinput.on('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;

    // 画像以外は弾く
    if (!file.type || !file.type.match(/^image\//)) {
      notify("画像ファイルを選択してください", { type: "warning", timeoutMs: 10000 });
      $(this).val('');
      return;
    }

    // （任意）ファイル名表示を更新
    if ($playername.length) $playername.text(file.name);

    // 画像プレビュー
    const reader = new FileReader();
    reader.onload = function (e) {
      $playerImagepreview.attr('src', e.target.result);
    };
    reader.readAsDataURL(file);
  });
});