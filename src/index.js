import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import { Server } from "socket.io";

import { loadConfig } from "./config.js";
import { createInitialState, resetMatch, getPublicState } from "./state.js";
import { startTick } from "./tick.js";
import { startTimerLoop, handleTimerStart, handleTimerPauseToggle } from "./timer.js";
import { createSCController } from "./sc.js";
import { createDb } from "./db.js";
import { createApiRouter } from "./routes/api.js";

const config = loadConfig();
const state = createInitialState(config);
const db = createDb(config);

const app = express();
app.use(cors({ origin: config.corsOrigin ?? "*" }));

// Pug setup
app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "pug");

// (optional) static assets folder
app.use("/assets", express.static("public"));

app.get("/", (req, res) => res.redirect("/admin"));
app.get("/admin", (req, res) => res.render("testhtml", { title: "Admin" }));
app.get("/hud", (req, res) => res.render("hud", { title: "HUD" }));
app.get("/input", (req, res) => res.render("input", { title: "Input" }));

app.use("/api", createApiRouter({ state, config }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigin ?? "*" }
});

// namespaces
const ioAdmin = io.of("/admin");
const ioHud = io.of("/hud");
const ioInput = io.of("/input");

// speed challenge controller
const sc = createSCController({ ioAdmin, ioHud, state });

// /input: receives snapshot every 250ms (latest-wins)
ioInput.on("connection", (socket) => {
  socket.on("snapshot", (payload) => {
    state.latestSnapshot = payload; // keep it light
  });
});

// /admin: receives triggers
ioAdmin.on("connection", (socket) => {
  socket.emit("state:init", getPublicState(state));

  socket.on("timer:start", ({ seconds }) => {
    handleTimerStart({ ioAdmin, ioHud, state, seconds });
  });

  socket.on("timer:pauseToggle", () => {
    handleTimerPauseToggle({ ioAdmin, ioHud, state });
  });

  socket.on("match:reset", async () => {
    if (db.enabled) {
      await db.enqueue(async () => {
        await db.saveMatchResult({
          total: { ...state.total },
          timerCount: state.timerCount,
          endedAt: Date.now()
        });
      });
      ioAdmin.emit("notify", { type: "info", message: "Saved match result." });
    }

    resetMatch(state, config);
    ioAdmin.emit("state:init", getPublicState(state));
    ioHud.emit("state:init", getPublicState(state));
  });

  socket.on("score:reset", () => {
    state.total.player01 = 0;
    state.total.player02 = 0;
  });

  socket.on("score:adjust", ({ player, delta }) => {
    if (player !== "player01" && player !== "player02") return;
    state.total[player] += Number(delta ?? 0);
  });

  socket.on("score:setMagnification", ({ player, magnification }) => {
    if (player !== "player01" && player !== "player02") return;
    const m = Number(magnification);
    if (!Number.isFinite(m) || m <= 0) return;
    state.magnification[player] = m;
  });

  socket.on("sc:start", ({ intervalSec, mainSec, magnification }) => {
    sc.start({
      intervalSec: Number(intervalSec ?? 10),
      mainSec: Number(mainSec ?? 10),
      magnification: Number(magnification ?? 2)
    });
  });

  socket.on("sc:success", ({ player }) => {
    sc.markSuccess(player);
  });
});

// /hud: send current state on connect
ioHud.on("connection", (socket) => {
  socket.emit("state:init", getPublicState(state));
});

// loops
startTick({ ioAdmin, ioHud, state, config });
startTimerLoop({ ioAdmin, ioHud, state });

server.listen(config.port ?? 3000, () => {
  console.log(`[server] listening on http://localhost:${config.port ?? 3000}`);
  console.log(`[pages] /admin /hud /input`);
});
