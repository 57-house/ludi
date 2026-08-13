const path = require("path");
const http = require("http");
const os = require("os");
const express = require("express");
const { WebSocketServer } = require("ws");
const E = require("./js/engine");

const PORT = Number(process.env.PORT) || 3000;
const RECONNECT_MS = 120000;
const TURN_MS = 60000;
const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();
const sockets = new Map();

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      disconnected: !p.ws,
    })),
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  room.players.forEach((p) => send(p.ws, msg));
}

function recolor(room) {
  const n = room.players.length;
  room.players.forEach((p, i) => {
    p.color = E.hslColor(i, n);
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

wss.on("connection", (ws) => {
  const client = { id: uid(), ws, room: null };
  sockets.set(ws, client);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      return;
    }
    handle(client, msg);
  });

  ws.on("close", () => {
    leave(client, false);
    sockets.delete(ws);
  });
});

function handle(client, msg) {
  if (msg.type === "create") return createRoom(client, msg.name);
  if (msg.type === "join") return joinRoom(client, msg.code, msg.name, msg.playerId);
  if (msg.type === "start") return startRoom(client);
  if (msg.type === "roll") return playRoll(client);
  if (msg.type === "move") return playMove(client, msg.pawnId);
  if (msg.type === "leave") return leave(client, true);
  if (msg.type === "chat") return chatMessage(client, msg.text);
}

function attachPlayer(player, client) {
  if (player.timer) {
    clearTimeout(player.timer);
    player.timer = null;
  }
  player.ws = client.ws;
  client.id = player.id;
  client.room = player.roomCode;
}

function createRoom(client, name) {
  leave(client, true);
  let c = code();
  while (rooms.has(c)) c = code();
  const player = {
    id: client.id,
    name: String(name || "Hôte").slice(0, 18),
    ws: client.ws,
    color: E.hslColor(0, 1),
    roomCode: c,
    timer: null,
  };
  const room = {
    code: c,
    hostId: client.id,
    status: "lobby",
    players: [player],
    game: null,
    chat: [],
  };
  rooms.set(c, room);
  client.room = c;
  recolor(room);
  send(client.ws, { type: "joined", playerId: client.id, isHost: true, room: publicRoom(room) });
  send(client.ws, { type: "lobby", room: publicRoom(room) });
  sendChatHistory(client, room);
}

function resumeClient(client, room, player) {
  attachPlayer(player, client);
  if (room.game) {
    const gp = room.game.players.find((p) => p.id === player.id);
    if (gp) gp.disconnected = false;
  }
  send(client.ws, {
    type: "joined",
    playerId: player.id,
    isHost: room.hostId === player.id,
    room: publicRoom(room),
  });
  if (room.status === "playing" && room.game) {
    send(client.ws, { type: "resume", state: room.game, room: publicRoom(room) });
    broadcast(room, { type: "lobby", room: publicRoom(room) });
  } else if (room.status === "ended" && room.game) {
    send(client.ws, { type: "resume", state: room.game, room: publicRoom(room) });
  } else {
    broadcast(room, { type: "lobby", room: publicRoom(room) });
  }
  sendChatHistory(client, room);
}

function joinRoom(client, rawCode, name, playerId) {
  const c = String(rawCode || "").trim().toUpperCase();
  const room = rooms.get(c);
  if (!room) return send(client.ws, { type: "error", error: "Table introuvable" });

  const existing = playerId && room.players.find((p) => p.id === playerId);
  if (existing) {
    if (client.room && client.room !== c) leave(client, true);
    if (name) existing.name = String(name).slice(0, 18);
    existing.roomCode = c;
    resumeClient(client, room, existing);
    return;
  }

  if (room.status !== "lobby") {
    return send(client.ws, { type: "error", error: "La partie a déjà commencé" });
  }
  if (room.players.some((p) => p.id === client.id)) return;
  leave(client, true);
  const player = {
    id: client.id,
    name: String(name || "Invité").slice(0, 18),
    ws: client.ws,
    color: E.hslColor(room.players.length, room.players.length + 1),
    roomCode: c,
    timer: null,
  };
  room.players.push(player);
  client.room = c;
  recolor(room);
  send(client.ws, {
    type: "joined",
    playerId: client.id,
    isHost: room.hostId === client.id,
    room: publicRoom(room),
  });
  broadcast(room, { type: "lobby", room: publicRoom(room) });
  sendChatHistory(client, room);
}

function sanitizeChat(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function sendChatHistory(client, room) {
  send(client.ws, { type: "chat-history", messages: (room.chat || []).slice(-80) });
}

function chatMessage(client, text) {
  const room = rooms.get(client.room);
  if (!room) return;
  const player = room.players.find((p) => p.id === client.id);
  if (!player) return;
  const t = sanitizeChat(text);
  if (!t) return;
  const message = {
    id: uid(),
    playerId: player.id,
    name: player.name,
    color: player.color && player.color.css,
    text: t,
    t: Date.now(),
  };
  if (!room.chat) room.chat = [];
  room.chat.push(message);
  if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
  broadcast(room, { type: "chat", message });
}

function startRoom(client) {
  const room = rooms.get(client.room);
  if (!room) return;
  if (room.hostId !== client.id) return send(client.ws, { type: "error", error: "Seul l’hôte ouvre la table" });
  if (room.players.length < 2) return send(client.ws, { type: "error", error: "Il faut au moins 2 joueurs" });
  room.game = E.createGame(
    room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, isBot: false }))
  );
  room.status = "playing";
  resetTurnTimer(room);
  broadcast(room, { type: "started", state: room.game });
}

function currentPlayer(room) {
  if (!room.game) return null;
  return room.game.players[room.game.current];
}

function playRoll(client) {
  const room = rooms.get(client.room);
  if (!room || !room.game) return;
  const cur = currentPlayer(room);
  if (!cur || cur.id !== client.id) {
    return send(client.ws, { type: "error", error: "Ce n’est pas votre tour" });
  }
  const index = room.game.current;
  const res = E.rollDice(room.game, index);
  if (!res.ok) return send(client.ws, { type: "error", error: res.error });
  if (room.game.phase === "ended") room.status = "ended";
  resetTurnTimer(room);
  broadcast(room, { type: "state", state: room.game });
}

function playMove(client, pawnId) {
  const room = rooms.get(client.room);
  if (!room || !room.game) return;
  const cur = currentPlayer(room);
  if (!cur || cur.id !== client.id) {
    return send(client.ws, { type: "error", error: "Ce n’est pas votre tour" });
  }
  const res = E.applyMove(room.game, room.game.current, pawnId);
  if (!res.ok) return send(client.ws, { type: "error", error: res.error });
  if (room.game.phase === "ended") room.status = "ended";
  resetTurnTimer(room);
  broadcast(room, { type: "state", state: room.game });
}

function dropPlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (!room.players.length) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
  if (room.status === "lobby") {
    recolor(room);
    broadcast(room, { type: "lobby", room: publicRoom(room) });
    return;
  }
  if (room.game) {
    const pi = room.game.players.findIndex((p) => p.id === playerId);
    if (pi >= 0) {
      room.game.players[pi].disconnected = true;
      if (room.game.current === pi && room.game.phase !== "ended") {
        room.game.current = E.nextActive(room.game, pi);
        room.game.phase = "waiting";
        room.game.diceValue = null;
        room.game.lastAction = {
          type: "skip",
          player: pi,
          message: room.game.players[pi].name + " a quitté la table",
        };
        resetTurnTimer(room);
      }
      broadcast(room, { type: "state", state: room.game });
    }
  }
}

function leave(client, immediate) {
  const c = client.room;
  if (!c) return;
  const room = rooms.get(c);
  if (!room) {
    client.room = null;
    return;
  }
  const player = room.players.find((p) => p.id === client.id);
  if (!player) {
    client.room = null;
    return;
  }
  if (!immediate) {
    player.ws = null;
    client.room = null;
    if (player.timer) clearTimeout(player.timer);
    player.timer = setTimeout(() => {
      player.timer = null;
      const still = rooms.get(c);
      if (!still) return;
      const pl = still.players.find((p) => p.id === player.id);
      if (!pl || pl.ws) return;
      dropPlayer(still, player.id);
    }, RECONNECT_MS);
    return;
  }
  if (player.timer) {
    clearTimeout(player.timer);
    player.timer = null;
  }
  client.room = null;
  dropPlayer(room, player.id);
}

function resetTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (!room.game || room.game.phase === "ended" || room.status === "ended") {
    if (room.game) room.game.turnEndsAt = null;
    return;
  }
  room.turnGen = (room.turnGen || 0) + 1;
  const gen = room.turnGen;
  room.game.turnEndsAt = Date.now() + TURN_MS;
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    if (room.turnGen !== gen) return;
    if (!room.game || room.game.phase === "ended") return;
    const res = E.skipTurn(room.game);
    if (!res.ok) return;
    resetTurnTimer(room);
    broadcast(room, { type: "state", state: room.game });
  }, TURN_MS);
}

function lanUrls(port) {
  const nets = os.networkInterfaces();
  const urls = [];
  Object.values(nets).forEach((addrs) => {
    (addrs || []).forEach((a) => {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (v4 && !a.internal) urls.push("http://" + a.address + ":" + port);
    });
  });
  return urls;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("LUDI : http://localhost:" + PORT);
  lanUrls(PORT).forEach((u) => console.log("Réseau local : " + u));
});
