"use strict";

// ============================================================
// WELCOME MODULE
// - Bot join hone pe intro message
// - Naya player aaye to welcome + server ki tarif
// - Kuch der baad periodic tarif (jab players online ho)
// Saari settings.json ke "welcome" block se aati hain.
// ============================================================

// Module-level state, taaki bot reconnect hone pe bhi spam na ho
let lastIntroAt = 0;
const lastWelcomed = new Map(); // username -> timestamp

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(template, vars) {
  return String(template)
    .replace(/\{player\}/g, vars.player || "")
    .replace(/\{server\}/g, vars.server || "");
}

function setupWelcome(bot, config, addLog) {
  const cfg = config.welcome;
  if (!cfg || cfg.enabled === false) return;

  const serverName = cfg["server-name"] || "this server";
  const timers = [];
  let ready = false;
  let ended = false;

  // ---- chat queue (server spam-kick se bachne ke liye gap ke saath) ----
  const queue = [];
  let sending = false;
  const gap = cfg["message-gap-ms"] || 1500;

  function say(text) {
    queue.push(text);
    drain();
  }

  function drain() {
    if (sending || ended) return;
    const next = queue.shift();
    if (!next) return;
    sending = true;
    try {
      bot.chat(next);
      addLog(`[Welcome] ${next}`);
    } catch (e) {
      addLog(`[Welcome] chat error: ${e.message}`);
    }
    setTimeout(() => {
      sending = false;
      drain();
    }, gap);
  }

  function later(fn, ms) {
    const t = setTimeout(() => {
      if (!ended) fn();
    }, ms);
    timers.push(t);
  }

  // ---- 1) Bot ka apna intro (auth ke baad) ----
  const introEvery = (cfg["intro-cooldown-seconds"] || 600) * 1000;
  if (
    cfg["join-message"] &&
    Date.now() - lastIntroAt >= introEvery
  ) {
    later(() => {
      lastIntroAt = Date.now();
      say(fill(cfg["join-message"], { server: serverName }));
    }, cfg["intro-delay-ms"] || 12000);
  }

  // ---- 2) Naye player ka welcome ----
  // Shuru ke kuch seconds ignore karte hain, kyunki us time tab-list
  // ke saare purane players ke liye bhi 'playerJoined' fire hota hai.
  later(() => {
    ready = true;
  }, cfg["ignore-existing-ms"] || 8000);

  bot.on("playerJoined", (player) => {
    if (!ready || ended || !player || !player.username) return;
    if (player.username === bot.username) return;

    const now = Date.now();
    const cooldown = (cfg["welcome-cooldown-seconds"] || 60) * 1000;
    const last = lastWelcomed.get(player.username) || 0;
    if (now - last < cooldown) return;
    lastWelcomed.set(player.username, now);

    const templates = cfg["welcome-messages"] || [];
    if (!templates.length) return;

    later(() => {
      // player abhi bhi online hai to hi welcome karo
      if (!bot.players || !bot.players[player.username]) return;
      say(fill(pick(templates), { player: player.username, server: serverName }));
    }, cfg["welcome-delay-ms"] || 3000);
  });

  // ---- 3) Optional goodbye ----
  if (cfg["goodbye-enabled"]) {
    bot.on("playerLeft", (player) => {
      if (!ready || ended || !player || !player.username) return;
      if (player.username === bot.username) return;
      const templates = cfg["goodbye-messages"] || [];
      if (!templates.length) return;
      say(fill(pick(templates), { player: player.username, server: serverName }));
    });
  }

  // ---- 4) Periodic server ki tarif (sirf jab koi aur online ho) ----
  const praiseList = cfg["praise-messages"] || [];
  const praiseEvery = (cfg["praise-interval-seconds"] || 900) * 1000;
  if (praiseList.length && cfg["praise-enabled"] !== false) {
    const iv = setInterval(() => {
      if (ended || !bot.players) return;
      const others = Object.keys(bot.players).filter((n) => n !== bot.username);
      if (others.length === 0) return;
      say(fill(pick(praiseList), { server: serverName }));
    }, praiseEvery);
    timers.push(iv);
  }

  // ---- cleanup ----
  bot.once("end", () => {
    ended = true;
    timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    queue.length = 0;
  });

  addLog("[Welcome] Welcome module active");
}

module.exports = setupWelcome;
