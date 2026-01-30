$(function () {
  const $menu  = $('#PanelMenuBar');
  const $links = $menu.find('a[href^="#"]');          // #MatchPanel など
  const $pages = $('.pages .page');                   // すべてのパネル

  // ARIA（任意。可変でも崩れにくく、アクセシブル）
  $menu.attr('role', 'tablist');
  $links.each(function () {
    const $a = $(this);
    const hash = $a.attr('href');                    // "#MatchPanel"
    const $panel = $(hash);

    const tabId = $a.attr('id') || `tab-${hash.slice(1)}`;
    $a.attr({
      id: tabId,
      role: 'tab',
      'aria-controls': hash.slice(1),
      'aria-selected': 'false',
      tabindex: -1
    });

    if ($panel.length) {
      $panel.attr({
        role: 'tabpanel',
        'aria-labelledby': tabId,
        'aria-hidden': 'true'
      });
    }
  });

  function activate(hash, pushHistory) {
    if (!hash) hash = $links.first().attr('href');

    // パネルが存在しない hash の場合は先頭へフォールバック
    if (!$(hash).length) hash = $links.first().attr('href');

    // タブの active 切り替え
    $menu.find('li').removeClass('is-active');
    $menu.find(`a[href="${hash}"]`).closest('li').addClass('is-active');

    // ARIA 切り替え
    $links.attr({ 'aria-selected': 'false', tabindex: -1 });
    const $activeLink = $menu.find(`a[href="${hash}"]`);
    $activeLink.attr({ 'aria-selected': 'true', tabindex: 0 });

    // パネル表示切り替え
    $pages.addClass('nondisplay').attr('aria-hidden', 'true');
    $(hash).removeClass('nondisplay').attr('aria-hidden', 'false');

    // URL更新（ページジャンプを抑えつつ履歴対応）
    if (pushHistory) {
      if (history && history.pushState) history.pushState(null, '', hash);
      else location.hash = hash;
    } else {
      if (history && history.replaceState) history.replaceState(null, '', hash);
    }
  }

  // 初期表示：いったん全部隠してから、hash or 先頭を表示
  $pages.addClass('nondisplay');
  activate(location.hash, false);

  // クリックで切り替え（イベント委譲なのでタブ増減にも強い）
  $menu.on('click', 'a[href^="#"]', function (e) {
    e.preventDefault();
    activate($(this).attr('href'), true);
  });

  // 戻る/進む・手動でhash変更にも追従
  $(window).on('popstate hashchange', function () {
    activate(location.hash, false);
  });

  // （任意）左右キーでタブ移動
  $menu.on('keydown', 'a[role="tab"]', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const $tabs = $menu.find('a[role="tab"]');
    const idx = $tabs.index(this);
    const nextIdx = e.key === 'ArrowRight'
      ? (idx + 1) % $tabs.length
      : (idx - 1 + $tabs.length) % $tabs.length;

    e.preventDefault();
    $tabs.eq(nextIdx).focus().trigger('click');
  });
});
