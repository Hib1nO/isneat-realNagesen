(function () {
    

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
        console.log("[matchpanel]", message, opt || "");
    }


    $(function () {
        const socket = io("/admin");

        socket.on("connect", function () {
            notifySafe("マッチサーバーに接続されました。", { type: "info", timeoutMs: 2000 });
        });

        socket.on("disconnect", function () {
            notifySafe("マッチサーバーから切断しまた。", { type: "info", timeoutMs: 2000 });
        });

        socket.on("state:init", function (state) {
            console.log(state)
        });
    })
})();