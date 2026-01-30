(function ($) {
  // jQueryが無い場合は何もしない（ここで落ちると原因が分かりにくいのでガード）
  if (!$) return;

  function ensureContainer() {
    let $c = $("#toast-container");
    if ($c.length === 0) {
      // 無ければ自動生成（adminページなど別レイアウトでも動く）
      $c = $('<div id="toast-container" aria-live="polite" aria-atomic="false"></div>');
      $("body").append($c);
    }
    return $c;
  }

  function removeToast($toast) {
    if (!$toast || $toast.length === 0) return;
    if ($toast.data("removing") === 1) return;
    $toast.data("removing", 1);

    $toast.removeClass("is-show");

    const el = $toast.get(0);
    $(el).one("transitionend", () => $toast.remove());

    // 保険（transitionendが来ない場合）
    setTimeout(() => {
      if ($toast.closest("body").length) $toast.remove();
    }, 400);
  }

  // ★ここで必ず定義する（コンテナの有無に依存しない）
  window.notify = function (message, opts = {}) {
    const type = opts.type || "info";
    const title = opts.title || "通知";
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;

    const $container = ensureContainer();

    const $toast = $(`
      <div class="toast notification is-${type}">
        <div class="toast__msg"></div>
        <button class="delete toast__close"</button>
      </div>
    `);

    $toast.find(".toast__msg").text(String(message));

    $toast.on("click", ".toast__close", function () {
      const timerId = $toast.data("timerId");
      if (timerId) clearTimeout(timerId);
      removeToast($toast);
    });

    $container.append($toast);

    requestAnimationFrame(() => $toast.addClass("is-show"));

    const timerId = setTimeout(() => removeToast($toast), timeoutMs);
    $toast.data("timerId", timerId);

    return $toast;
  };
})(window.jQuery);
