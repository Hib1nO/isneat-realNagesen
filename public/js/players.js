window.PlayersStore = (function () {
  let cache = null;
  let cacheAt = 0;
  const CACHE_MS = 10000;

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function load(force) {
    const now = Date.now();
    if (!force && cache && (now - cacheAt) < CACHE_MS) {
      return $.Deferred().resolve(cache).promise();
    }

    return $.ajax({
      url: "/api/players",
      method: "GET",
      dataType: "json"
    }).then(function (data) {
      if (!data || !data.ok) {
        return $.Deferred().reject(data?.message || "players load failed").promise();
      }
      cache = data.items || [];
      cacheAt = now;
      return cache;
    });
  }

  function buildOptionsHtml(players) {
    return (players || [])
      .map(function (p) {
        const id = escapeHtml(p.playerId);
        const name = escapeHtml(p.name || "(no name)");
        return `<option value="${id}">${name}</option>`;
      })
      .join("");
  }

  return {
    load: load,
    buildOptionsHtml: buildOptionsHtml
  };
})();
