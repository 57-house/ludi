(function () {
  const E = window.LudoEngine;
  const B = window.LudoBoard;
  const S = window.LudoSounds;
  const F = window.LudoFireworks;

  const DICE_ROT = {
    1: [0, 0],
    2: [0, -90],
    3: [0, 180],
    4: [0, 90],
    5: [-90, 0],
    6: [90, 0],
  };

  const DEFAULT_PREVIEW = ["Rouge", "Vert", "Jaune", "Bleu"].map((name, i) => ({
    name,
    color: E.hslColor(i, 4),
  }));

  const els = {
    lobby: document.getElementById("view-lobby"),
    game: document.getElementById("view-game"),
    preview: document.getElementById("preview"),
    board: document.getElementById("board"),
    growBadge: document.getElementById("grow-badge"),
    turnName: document.getElementById("turn-name"),
    turnHelp: document.getElementById("turn-help"),
    roster: document.getElementById("roster"),
    log: document.getElementById("log"),
    cube: document.getElementById("cube"),
    diceWrap: document.getElementById("dice-wrap"),
    dice: document.getElementById("dice"),
    win: document.getElementById("overlay-win"),
    winText: document.getElementById("win-text"),
    podium: document.getElementById("podium"),
    roomInfo: document.getElementById("room-info"),
    roomCode: document.getElementById("room-code"),
    roomUrl: document.getElementById("room-url"),
    onlinePlayers: document.getElementById("online-players"),
    onlineHint: document.getElementById("online-hint"),
    onlineStatus: document.getElementById("online-status"),
    btnStartOnline: document.getElementById("btn-start-online"),
    btnCopy: document.getElementById("btn-copy"),
    onlineName: document.getElementById("online-name"),
    joinCode: document.getElementById("join-code"),
    chatLogLobby: document.getElementById("chat-log-lobby"),
    chatLogGame: document.getElementById("chat-log-game"),
    chatFormLobby: document.getElementById("chat-form-lobby"),
    chatFormGame: document.getElementById("chat-form-game"),
    chatInputLobby: document.getElementById("chat-input-lobby"),
    chatInputGame: document.getElementById("chat-input-game"),
    chatPanelLobby: document.getElementById("chat-panel-lobby"),
    chatPanelGame: document.getElementById("chat-panel-game"),
    chatToggleLobby: document.getElementById("btn-chat-toggle-lobby"),
    chatToggleGame: document.getElementById("btn-chat-toggle-game"),
    chatCloseLobby: document.getElementById("btn-chat-close-lobby"),
    chatCloseGame: document.getElementById("btn-chat-close-game"),
    chatBadgeLobby: document.getElementById("chat-badge-lobby"),
    chatBadgeGame: document.getElementById("chat-badge-game"),
    chatBackdropGame: document.getElementById("chat-backdrop-game"),
    chatToast: document.getElementById("chat-toast"),
    chatToastWho: document.querySelector(".chat-toast-who"),
    chatToastText: document.querySelector(".chat-toast-text"),
  };

  const STORAGE_KEY = "ludo-infini-session";

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveSession(extra) {
    const prev = loadSaved();
    const next = Object.assign({}, prev, extra || {});
    if (els.onlineName && els.onlineName.value.trim()) next.name = els.onlineName.value.trim();
    if (session.myId) next.playerId = session.myId;
    if (session.room && session.room.code) next.code = session.room.code;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function clearRoomSave() {
    const prev = loadSaved();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: els.onlineName.value.trim() || prev.name || "" })
    );
  }

  const session = {
    game: null,
    hits: [],
    highlights: [],
    hover: null,
    anim: null,
    busy: false,
    turnReveal: null,
    net: null,
    myId: null,
    room: null,
    isHost: false,
    chat: {
      lobbyOpen: false,
      gameOpen: false,
      unreadLobby: 0,
      unreadGame: 0,
      toastTimer: null,
    },
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const TURN_REVEAL_MS = 1400;

  function turnRevealActive() {
    return session.turnReveal && performance.now() < session.turnReveal.until;
  }

  function clearTurnRevealIfExpired() {
    if (session.turnReveal && performance.now() >= session.turnReveal.until) {
      session.turnReveal = null;
    }
  }

  function uiTurnIndex(g) {
    clearTurnRevealIfExpired();
    if (session.turnReveal) return session.turnReveal.playerIndex;
    return g.current;
  }

  function shouldRevealTurn(action) {
    if (!action || !session.game) return false;
    const g = session.game;
    if (g.phase === "ended") return false;
    if (action.extraTurn) return false;
    if (action.type === "move") {
      return g.phase === "waiting" && action.player !== g.current;
    }
    if (action.type === "bust" || action.type === "timeout") return true;
    if (action.type === "skip") return true;
    return false;
  }

  function startTurnReveal(action) {
    session.turnReveal = {
      playerIndex: action.player,
      dice: action.dice,
      until: performance.now() + TURN_REVEAL_MS,
    };
  }

  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function previewDefs() {
    if (session.room && session.room.players.length) {
      return session.room.players.map((p, i) => ({
        name: p.name,
        color: p.color || E.hslColor(i, session.room.players.length),
      }));
    }
    return DEFAULT_PREVIEW;
  }

  function layoutFor(canvas, n) {
    const { ctx, w, h } = fitCanvas(canvas);
    const isGame = canvas === els.board;
    const padX = Math.max(10, w * 0.02);
    const padY = isGame
      ? Math.max(92, Math.min(150, h * 0.15))
      : Math.max(12, Math.min(w, h) * 0.03);
    const radius = Math.max(48, Math.min(w - padX * 2, h - padY * 2) / 2);
    const layout = B.computeLayout(n, w / 2, h / 2, radius);
    return { ctx, w, h, layout };
  }

  function drawPreview() {
    const defs = previewDefs();
    const n = Math.max(defs.length, 2);
    const fake = E.createGame(defs);
    const { ctx, w, h, layout } = layoutFor(els.preview, n);
    B.drawBoard(ctx, layout, fake, { width: w, height: h });
    els.growBadge.textContent =
      n === 4 ? "Plateau classique · 4 joueurs" : n + " joueurs · le plateau s’élargit";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function chatScope() {
    return els.game.classList.contains("active") ? "game" : "lobby";
  }

  function isChatOpen(scope) {
    scope = scope || chatScope();
    return scope === "game" ? session.chat.gameOpen : session.chat.lobbyOpen;
  }

  function setChatOpen(scope, open) {
    if (scope === "game") {
      session.chat.gameOpen = open;
      if (els.chatPanelGame) els.chatPanelGame.hidden = !open;
      if (els.chatBackdropGame) els.chatBackdropGame.hidden = !open;
      if (open) {
        session.chat.unreadGame = 0;
        updateChatBadge("game");
        if (els.chatInputGame) els.chatInputGame.focus();
      }
    } else {
      session.chat.lobbyOpen = open;
      if (els.chatPanelLobby) els.chatPanelLobby.hidden = !open;
      if (open) {
        session.chat.unreadLobby = 0;
        updateChatBadge("lobby");
        if (els.chatInputLobby) els.chatInputLobby.focus();
      }
    }
  }

  function toggleChat(scope) {
    setChatOpen(scope, !isChatOpen(scope));
  }

  function updateChatBadge(scope) {
    const badge = scope === "game" ? els.chatBadgeGame : els.chatBadgeLobby;
    const count = scope === "game" ? session.chat.unreadGame : session.chat.unreadLobby;
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 9 ? "9+" : String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "0";
    }
  }

  function hideChatToast() {
    if (!els.chatToast) return;
    els.chatToast.classList.remove("show");
    clearTimeout(session.chat.toastTimer);
    session.chat.toastTimer = setTimeout(() => {
      els.chatToast.hidden = true;
    }, 280);
  }

  function showChatToast(message) {
    if (!message || !message.text || !els.chatToast) return;
    if (message.playerId && message.playerId === session.myId) return;
    const scope = chatScope();
    if (isChatOpen(scope)) return;

    if (scope === "game") {
      session.chat.unreadGame += 1;
      updateChatBadge("game");
    } else {
      session.chat.unreadLobby += 1;
      updateChatBadge("lobby");
    }

    if (els.chatToastWho) {
      els.chatToastWho.textContent = (message.name || "Joueur") + " :";
      els.chatToastWho.style.color = message.color || "#fbc02d";
    }
    if (els.chatToastText) els.chatToastText.textContent = message.text;

    els.chatToast.hidden = false;
    void els.chatToast.offsetWidth;
    els.chatToast.classList.add("show");

    clearTimeout(session.chat.toastTimer);
    session.chat.toastTimer = setTimeout(hideChatToast, 3200);
  }

  function chatLogs() {
    return [els.chatLogLobby, els.chatLogGame].filter(Boolean);
  }

  function clearChat() {
    chatLogs().forEach((el) => {
      el.innerHTML = "";
    });
  }

  function appendChat(message, replace) {
    if (replace) clearChat();
    const list = Array.isArray(message) ? message : [message];
    list.forEach((m) => {
      if (!m || !m.text) return;
      chatLogs().forEach((el) => {
        const line = document.createElement("div");
        line.className = "chat-line";
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = (m.name || "Joueur") + " :";
        if (m.color) who.style.color = m.color;
        const body = document.createElement("span");
        body.textContent = m.text;
        line.appendChild(who);
        line.appendChild(body);
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
      });
      if (!replace) showChatToast(m);
    });
  }

  function sendChat(text) {
    const t = String(text || "").trim();
    if (!t || !session.net) return;
    session.net.send({ type: "chat", text: t.slice(0, 160) });
  }

  function setView(name) {
    els.lobby.classList.toggle("active", name === "lobby");
    els.game.classList.toggle("active", name === "game");
    if (els.chatToggleGame) els.chatToggleGame.hidden = name !== "game";
    if (name !== "game") setChatOpen("game", false);
    if (name === "lobby") requestAnimationFrame(drawPreview);
    if (name === "game") {
      startHudClock();
      requestAnimationFrame(drawGame);
    }
  }

  function setDice(value, rolling) {
    const rot = DICE_ROT[value] || DICE_ROT[1];
    els.cube.style.setProperty("--rx", rot[0] + "deg");
    els.cube.style.setProperty("--ry", rot[1] + "deg");
    els.cube.style.transform = "rotateX(" + rot[0] + "deg) rotateY(" + rot[1] + "deg)";
    if (rolling) {
      els.cube.classList.remove("rolling");
      void els.cube.offsetWidth;
      els.cube.classList.add("rolling");
      setTimeout(() => els.cube.classList.remove("rolling"), 480);
    }
  }

  function log(msg) {
    els.log.textContent = msg;
  }

  function currentIsMe() {
    if (!session.game || !session.myId) return false;
    const me = session.game.players.findIndex((p) => p.id === session.myId);
    return me === session.game.current;
  }

  function updateHud() {
    const g = session.game;
    if (!g) return;
    const revealing = turnRevealActive();
    const uiIdx = uiTurnIndex(g);
    const pl = g.players[uiIdx];
    els.turnName.textContent = pl ? pl.name : "—";
    els.turnName.style.color = pl ? pl.color.cssDark || pl.color.css : "";
    if (g.phase === "ended") els.turnHelp.textContent = "Partie terminée";
    else if (revealing) els.turnHelp.textContent = "Fin du tour…";
    else if (g.phase === "rolled") els.turnHelp.textContent = (currentIsMe() ? "Cliquez un pion allumé" : "L’adversaire choisit un pion") + turnClock();
    else els.turnHelp.textContent = (currentIsMe() ? "Cliquez le dé pour jouer" : "En attente du joueur…") + turnClock();

    els.roster.innerHTML = "";
    g.players.forEach((p, i) => {
      const span = document.createElement("span");
      if (i === uiIdx && g.phase !== "ended") {
        span.classList.add("current", "playing");
        span.style.setProperty("--player-color", p.color.css);
      }
      const home = p.pawns.filter((pw) => pw.area === "done").length;
      span.innerHTML =
        '<i class="swatch" style="background:' +
        p.color.css +
        ';display:inline-block"></i>' +
        escapeHtml(p.name) +
        " · " +
        home +
        "/4";
      els.roster.appendChild(span);
    });

    const canRoll =
      !revealing && g.phase === "waiting" && currentIsMe() && !session.busy && g.phase !== "ended";
    const isPlaying = pl && g.phase !== "ended";
    els.diceWrap.classList.toggle("turn-active", !revealing && g.phase === "waiting");
    els.diceWrap.classList.toggle("can-roll", canRoll);
    if (isPlaying) {
      els.diceWrap.style.setProperty("--turn-color", pl.color.css);
      els.diceWrap.style.setProperty("--dice-face-top", pl.color.cssLight || pl.color.cssSoft || pl.color.css);
      els.diceWrap.style.setProperty("--dice-face-bottom", pl.color.css);
      els.diceWrap.style.setProperty("--dice-border", pl.color.cssDark || pl.color.css);
      els.diceWrap.style.setProperty("--dice-pip", "#111");
    } else {
      els.diceWrap.style.removeProperty("--turn-color");
      els.diceWrap.style.removeProperty("--dice-face-top");
      els.diceWrap.style.removeProperty("--dice-face-bottom");
      els.diceWrap.style.removeProperty("--dice-border");
      els.diceWrap.style.removeProperty("--dice-pip");
    }
    if (revealing && session.turnReveal.dice) setDice(session.turnReveal.dice, false);
    else if (g.phase === "rolled" && g.diceValue) setDice(g.diceValue, false);
    els.dice.setAttribute("aria-disabled", canRoll ? "false" : "true");
    els.dice.tabIndex = canRoll ? 0 : -1;

    els.game.classList.toggle("board-turn-active", isPlaying);
    if (isPlaying) {
      els.game.style.setProperty("--turn-color", pl.color.css);
    } else {
      els.game.style.removeProperty("--turn-color");
    }

    if (els.turnHelp && remainingTurnSec() <= 10 && g.phase !== "ended") {
      els.turnHelp.style.color = "#c62828";
    } else if (els.turnHelp) {
      els.turnHelp.style.color = "";
    }
  }

  function remainingTurnSec() {
    if (!session.game || !session.game.turnEndsAt) return 99;
    return Math.max(0, Math.ceil((session.game.turnEndsAt - Date.now()) / 1000));
  }

  function turnClock() {
    if (!session.game || !session.game.turnEndsAt || session.game.phase === "ended") return "";
    const s = remainingTurnSec();
    const m = Math.floor(s / 60);
    const r = String(s % 60).padStart(2, "0");
    return " · " + m + ":" + r;
  }

  function startHudClock() {
    if (session.hudClock) return;
    session.hudClock = setInterval(() => {
      if (!session.game || !els.game.classList.contains("active")) return;
      updateHud();
    }, 250);
  }

  function drawGame(reuse) {
    if (!session.game || !els.game.classList.contains("active")) return;
    if (!reuse || !session.boardDraw) {
      const sized = layoutFor(els.board, session.game.n);
      session.layout = sized.layout;
      session.boardDraw = sized;
    }
    const { ctx, w, h, layout } = session.boardDraw;
    session.hits = B.drawBoard(ctx, layout, session.game, {
      width: w,
      height: h,
      highlights: session.highlights,
      hoverPawn: session.hover,
      anim: session.anim,
      time: performance.now(),
    });
    const g = session.game;
    if (g.phase !== "ended" || session.highlights.length || session.anim) ensureBoardAnim();
  }

  function ensureBoardAnim() {
    if (session.boardAnimRaf) return;
    function tick() {
      if (!session.game || !els.game.classList.contains("active")) {
        session.boardAnimRaf = 0;
        return;
      }
      const g = session.game;
      const active = g.phase !== "ended" || session.highlights.length || session.anim;
      if (!active) {
        session.boardAnimRaf = 0;
        return;
      }
      drawGame(true);
      session.boardAnimRaf = requestAnimationFrame(tick);
    }
    session.boardAnimRaf = requestAnimationFrame(tick);
  }

  function mouseOnBoard(ev) {
    const rect = els.board.getBoundingClientRect();
    const pt =
      ev.changedTouches && ev.changedTouches[0]
        ? ev.changedTouches[0]
        : ev.touches && ev.touches[0]
          ? ev.touches[0]
          : ev;
    return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
  }

  function hitPawn(x, y) {
    for (let i = session.hits.length - 1; i >= 0; i--) {
      const h = session.hits[i];
      if (Math.hypot(h.x - x, h.y - y) <= h.r) return h;
    }
    return null;
  }

  async function animateMove(action) {
    if (!action || action.type !== "move") return;
    if (!session.layout) {
      const sized = layoutFor(els.board, session.game.n);
      session.layout = sized.layout;
    }
    const pts = B.buildPath(
      session.layout,
      session.game,
      action.player,
      action.from,
      action.dest,
      action.pawnId
    );
    if (pts.length < 2) return;
    if (S) S.playPawnMove();
    const duration = Math.min(480, 85 * pts.length);
    const t0 = performance.now();
    let lastStep = -1;
    await new Promise((resolve) => {
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const f = t * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(f));
        if (i !== lastStep) {
          lastStep = i;
          if (i > 0 && S) S.playPawnStep();
        }
        const lt = f - i;
        const a = pts[i];
        const b = pts[i + 1];
        session.anim = {
          player: action.player,
          pawnId: action.pawnId,
          pos: { x: a.x + (b.x - a.x) * lt, y: a.y + (b.y - a.y) * lt },
        };
        drawGame();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
    session.anim = null;
  }

  async function handleResult(res, rolledNow) {
    session.busy = true;
    try {
      if (!res || !res.ok) {
        if (res && res.error) log(res.error);
        return;
      }
      const action = session.game.lastAction;
      if (rolledNow && action && action.dice) {
        if (S) S.playDiceRoll();
        setDice(action.dice, true);
        await sleep(300);
      }
      if (action && action.type === "move") {
        await animateMove(action);
        if (action.captured && action.captured.length) {
          const eater = session.game.players[action.player];
          const victims = action.captured
            .map((c) => session.game.players[c.player] && session.game.players[c.player].name)
            .filter(Boolean);
          log(
            (eater ? eater.name : "Un pion") +
              " a bouffé " +
              (victims.length ? victims.join(", ") : "un pion") +
              " ! Retour à la maison." +
              (action.extraTurn ? " Relancez." : "")
          );
        } else if (action.justFinished) {
          log(session.game.players[action.player].name + " a ramené tous ses pions.");
        } else if (action.extraTurn) {
          log("6 ! Relancez le dé.");
        }
      } else if (action && action.message) {
        log(action.message);
      } else if (action && action.type === "roll") {
        log("Un " + action.dice + " — cliquez un pion allumé.");
      }

      session.highlights = [];
      if (session.game.phase === "rolled") {
        const moves = E.legalMoves(session.game, session.game.current, session.game.diceValue);
        session.highlights = moves.map((m) => ({
          player: session.game.current,
          pawnId: m.pawnId,
        }));
      }

      if (shouldRevealTurn(action)) {
        startTurnReveal(action);
        drawGame();
        updateHud();
        await sleep(TURN_REVEAL_MS);
        session.turnReveal = null;
      }

      drawGame();
      updateHud();

      if (session.game.phase === "ended") showWin();
    } finally {
      session.busy = false;
      drawGame();
      updateHud();
    }
  }

  function doRoll() {
    if (session.busy || !session.game || session.game.phase !== "waiting") return;
    if (!currentIsMe() || !session.net) return;
    log("Lancement du dé…");
    session.net.send({ type: "roll" });
  }

  function doMove(pawnId) {
    if (!session.game || session.game.phase !== "rolled") return;
    if (!currentIsMe() || !session.net) return;
    session.net.send({ type: "move", pawnId });
  }

  function showWin() {
    const g = session.game;
    const first = g.players[g.winners[0]];
    els.winText.textContent = first ? first.name + " remporte la table." : "Table fermée.";
    els.podium.innerHTML = "";
    g.players
      .slice()
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .forEach((p) => {
        const d = document.createElement("div");
        d.className = "player-chip";
        d.innerHTML =
          '<span class="swatch" style="background:' +
          p.color.css +
          '"></span><span>#' +
          (p.rank || "—") +
          " · " +
          escapeHtml(p.name) +
          "</span>";
        els.podium.appendChild(d);
      });
    els.win.classList.add("show");
    if (F) F.start("win-fireworks");
  }

  function quitToLobby() {
    session.game = null;
    session.highlights = [];
    if (F) F.stop();
    els.win.classList.remove("show");
    if (session.net) {
      session.net.send({ type: "leave" });
      session.net.close();
      session.net = null;
      session.room = null;
      session.myId = null;
      els.roomInfo.hidden = true;
    }
    clearChat();
    setChatOpen("lobby", false);
    setChatOpen("game", false);
    hideChatToast();
    clearRoomSave();
    setView("lobby");
    connectNet();
  }

  function appBase() {
    let base = location.pathname;
    if (base.endsWith("/")) base = base.slice(0, -1);
    else if (/\.[a-z0-9]+$/i.test(base)) base = base.replace(/\/[^/]+$/, "");
    if (!base || base === "/") return "";
    return base;
  }

  async function probeServer() {
    try {
      const res = await fetch(appBase() + "/api/health", { cache: "no-store" });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function roomJoinUrl(code) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    const base = appBase();
    url.pathname = ((base ? base : "") + "/").replace(/\/{2,}/g, "/");
    url.searchParams.set("salle", code);
    return url.toString();
  }

  let pendingJoinCode = null;

  function joinRoomByCode(code) {
    code = String(code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    if (!code) {
      els.onlineStatus.textContent = "Entrez le code de la table.";
      return;
    }
    const saved = loadSaved();
    const name = (els.onlineName.value.trim() || saved.name || "Joueur").slice(0, 18);
    if (!els.onlineName.value.trim()) els.onlineName.value = name;
    els.joinCode.value = code;
    saveSession({ name, code });
    history.replaceState(null, "", roomJoinUrl(code));
    els.onlineStatus.textContent = "Entrée dans la table " + code + "…";
    const net = connectNet();
    if (!net) return;
    sendWhenReady(net, {
      type: "join",
      name,
      code,
      playerId: saved.code === code ? saved.playerId : undefined,
    });
  }

  function connectNet() {
    if (location.protocol === "file:") {
      els.onlineStatus.textContent = "Ouvrez le jeu via npm start pour jouer en ligne.";
      return null;
    }
    if (typeof io === "undefined") {
      els.onlineStatus.textContent = "Chargement du client réseau…";
      setTimeout(connectNet, 400);
      return null;
    }
    if (session.net && session.net.socket && session.net.socket.connected) return session.net;

    const socket = io({
      path: appBase() + "/socket.io",
      transports: ["websocket", "polling"],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
    });
    const net = {
      socket,
      send(msg) {
        socket.emit("msg", msg);
      },
      close() {
        session.skipReconnect = true;
        socket.disconnect();
      },
    };
    probeServer().then((ok) => {
      if (!ok && session.net === net) {
        els.onlineStatus.textContent =
          "Le site s’affiche, mais le serveur Node ne répond pas. Dans cPanel : Run NPM Install, puis Restart l’app Node.";
      }
    });
    socket.on("connect", () => {
      const saved = loadSaved();
      if (saved.name && !els.onlineName.value) els.onlineName.value = saved.name;
      if (pendingJoinCode) {
        const code = pendingJoinCode;
        pendingJoinCode = null;
        joinRoomByCode(code);
      } else if (saved.code && saved.playerId) {
        els.onlineStatus.textContent = "Reconnexion à la table…";
        els.joinCode.value = saved.code;
        net.send({
          type: "join",
          code: saved.code,
          name: els.onlineName.value.trim() || saved.name || "Joueur",
          playerId: saved.playerId,
        });
      } else {
        els.onlineStatus.textContent = "Connecté. Créez une table ou entrez un code.";
      }
    });
    socket.on("disconnect", () => {
      if (session.net === net) {
        session.net = null;
        if (session.skipReconnect) {
          session.skipReconnect = false;
          return;
        }
        els.onlineStatus.textContent = "Connexion perdue. Nouvelle tentative…";
        setTimeout(connectNet, 800);
      }
    });
    socket.on("connect_error", () => {
      if (session.net === net) {
        els.onlineStatus.textContent = "Connexion au salon impossible. Nouvelle tentative…";
      }
    });
    socket.on("msg", (msg) => onNet(msg));
    session.net = net;
    return net;
  }

  async function onNet(msg) {
    if (msg.type === "error") {
      log(msg.error || "Erreur réseau");
      els.onlineStatus.textContent = msg.error || "Erreur";
      return;
    }
    if (msg.type === "joined") {
      session.myId = msg.playerId;
      session.isHost = !!msg.isHost;
      session.room = msg.room;
      paintRoom(msg.room);
      saveSession({ name: els.onlineName.value.trim(), playerId: msg.playerId, code: msg.room.code });
      return;
    }
    if (msg.type === "lobby") {
      session.room = msg.room;
      paintRoom(msg.room);
      drawPreview();
      if (msg.room && msg.room.code) saveSession({ code: msg.room.code });
      return;
    }
    if (msg.type === "resume") {
      session.game = msg.state;
      if (msg.room) {
        session.room = msg.room;
        session.isHost = msg.room.hostId === session.myId;
      }
      saveSession({ code: session.room && session.room.code, playerId: session.myId });
      setView("game");
      session.highlights = [];
      if (session.game.phase === "rolled") {
        const moves = E.legalMoves(session.game, session.game.current, session.game.diceValue);
        session.highlights = moves.map((m) => ({
          player: session.game.current,
          pawnId: m.pawnId,
        }));
        if (session.game.diceValue) setDice(session.game.diceValue, false);
      }
      log("Vous êtes de retour à la table.");
      updateHud();
      drawGame();
      if (session.game.phase === "ended") showWin();
      return;
    }
    if (msg.type === "chat-history") {
      appendChat(msg.messages || [], true);
      return;
    }
    if (msg.type === "chat" && msg.message) {
      appendChat(msg.message);
      return;
    }
    if (msg.type === "started" || msg.type === "state") {
      session.game = msg.state;
      if (!els.game.classList.contains("active")) setView("game");
      const action = session.game.lastAction;
      if (msg.type === "state") {
        await handleResult({ ok: true }, !!(action && action.dice && action.type !== "move"));
      } else {
        session.highlights = [];
        log("Tout le monde est installé. Que la partie commence.");
        updateHud();
        drawGame();
      }
    }
  }

  function paintRoom(room) {
    if (!room) return;
    els.roomInfo.hidden = false;
    els.roomCode.textContent = room.code;
    const url = roomJoinUrl(room.code);
    els.roomUrl.href = url;
    els.roomUrl.textContent = url;
    els.onlinePlayers.innerHTML = "";
    room.players.forEach((p, i) => {
      const color = p.color || E.hslColor(i, room.players.length);
      const row = document.createElement("div");
      row.className = "player-chip";
      row.innerHTML =
        '<span class="swatch" style="background:' +
        color.css +
        '"></span><span>' +
        escapeHtml(p.name) +
        (p.id === room.hostId ? " · hôte" : "") +
        "</span>";
      els.onlinePlayers.appendChild(row);
    });
    els.onlineHint.textContent =
      room.players.length +
      " joueur(s) autour de la table. Chaque entrée ajoute un bras coloré.";
    els.btnStartOnline.hidden = !session.isHost;
    els.btnStartOnline.disabled = room.players.length < 2;
  }

  function sendWhenReady(net, msg) {
    const send = () => net.send(msg);
    if (net.socket.connected) send();
    else net.socket.once("connect", send);
  }

  function tryRollDice() {
    if (session.busy || !session.game || session.game.phase !== "waiting" || !currentIsMe()) return;
    doRoll();
  }

  els.diceWrap.addEventListener("click", tryRollDice);
  els.dice.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tryRollDice();
    }
  });
  document.getElementById("btn-quit").addEventListener("click", quitToLobby);
  document.getElementById("btn-again").addEventListener("click", quitToLobby);
  document.getElementById("btn-rules").addEventListener("click", () => {
    document.getElementById("overlay-rules").classList.add("show");
  });
  document.getElementById("btn-rules-close").addEventListener("click", () => {
    document.getElementById("overlay-rules").classList.remove("show");
  });

  els.board.addEventListener("mousemove", (e) => {
    const m = mouseOnBoard(e);
    const hit = hitPawn(m.x, m.y);
    const next = hit ? { player: hit.player, pawnId: hit.pawnId } : null;
    const same =
      (!!session.hover === !!next) &&
      (!next || (session.hover.player === next.player && session.hover.pawnId === next.pawnId));
    if (!same) {
      session.hover = next;
      els.board.style.cursor = hit ? "pointer" : "default";
      drawGame(true);
    }
  });

  function tryMoveAt(e) {
    if (e.target.closest("button, input, .dice, .log, .roster, .turn-banner, .chat-box, .chat-toast, .chat-fab, .chat-backdrop")) return;
    if (!session.game || session.game.phase !== "rolled" || session.busy) return;
    const m = mouseOnBoard(e);
    const hit = hitPawn(m.x, m.y);
    if (!hit) return;
    const ok = session.highlights.some((h) => h.player === hit.player && h.pawnId === hit.pawnId);
    if (ok) doMove(hit.pawnId);
  }
  els.game.addEventListener("click", tryMoveAt);
  els.game.addEventListener(
    "touchend",
    (e) => {
      if (e.target.closest("button, input, .dice, .log, .roster, .turn-banner, .chat-box, .chat-toast, .chat-fab, .chat-backdrop")) return;
      e.preventDefault();
      tryMoveAt(e);
    },
    { passive: false }
  );

  document.getElementById("btn-create").addEventListener("click", () => {
    const net = connectNet();
    if (!net) return;
    const name = els.onlineName.value.trim() || "Hôte";
    saveSession({ name });
    sendWhenReady(net, { type: "create", name });
  });
  document.getElementById("btn-join").addEventListener("click", () => {
    if (!connectNet()) return;
    joinRoomByCode(els.joinCode.value.trim());
  });
  els.joinCode.addEventListener("input", () => {
    els.joinCode.value = els.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  els.joinCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-join").click();
  });
  els.onlineName.addEventListener("input", () => {
    saveSession({ name: els.onlineName.value.trim() });
  });
  els.onlineName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-create").click();
  });
  document.getElementById("btn-start-online").addEventListener("click", () => {
    if (session.net) session.net.send({ type: "start" });
  });
  document.getElementById("btn-leave").addEventListener("click", quitToLobby);

  function bindChatForm(form, input) {
    if (!form || !input) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendChat(input.value);
      input.value = "";
    });
  }
  bindChatForm(els.chatFormLobby, els.chatInputLobby);
  bindChatForm(els.chatFormGame, els.chatInputGame);

  function bindChatClose(el, scope) {
    if (!el) return;
    const close = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setChatOpen(scope, false);
    };
    el.addEventListener("click", close);
    el.addEventListener("touchend", close, { passive: false });
  }

  if (els.chatToggleLobby) els.chatToggleLobby.addEventListener("click", () => toggleChat("lobby"));
  if (els.chatToggleGame) {
    const openGameChat = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleChat("game");
    };
    els.chatToggleGame.addEventListener("click", openGameChat);
    els.chatToggleGame.addEventListener("touchend", openGameChat, { passive: false });
  }
  bindChatClose(els.chatCloseLobby, "lobby");
  bindChatClose(els.chatCloseGame, "game");
  if (els.chatBackdropGame) bindChatClose(els.chatBackdropGame, "game");
  if (els.chatToast) {
    els.chatToast.addEventListener("click", () => {
      hideChatToast();
      toggleChat(chatScope());
    });
  }

  els.btnCopy.addEventListener("click", async () => {
    const url = els.roomUrl.href || els.roomUrl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      els.btnCopy.textContent = "Lien copié";
      setTimeout(() => {
        els.btnCopy.textContent = "Copier le lien";
      }, 1600);
    } catch (e) {
      els.onlineStatus.textContent = url;
    }
  });

  window.addEventListener("resize", () => {
    if (els.lobby.classList.contains("active")) drawPreview();
    if (els.game.classList.contains("active")) drawGame();
  });

  if (els.roomUrl) {
    els.roomUrl.addEventListener("click", (e) => {
      const code =
        new URL(els.roomUrl.href, location.href).searchParams.get("salle") ||
        els.roomCode.textContent;
      if (session.room && session.room.code === code) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      joinRoomByCode(code);
    });
  }

  const params = new URLSearchParams(location.search);
  const saved = loadSaved();
  if (saved.name) els.onlineName.value = saved.name;
  const salle = params.get("salle");
  if (salle) {
    const code = salle.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code) {
      els.joinCode.value = code;
      pendingJoinCode = code;
    }
  } else if (saved.code) {
    els.joinCode.value = saved.code;
  }

  function unlockAudio() {
    if (S) S.unlock();
  }
  document.addEventListener("click", unlockAudio, { once: true, capture: true });
  document.addEventListener("touchstart", unlockAudio, { once: true, capture: true });

  connectNet();
  drawPreview();
})();
