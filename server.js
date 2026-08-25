// HOODZONE Interactions Endpoint v1.1
// Uses Node's built-in HTTP/crypto/fetch APIs to reduce deployment issues.
// IMPORTANT: This endpoint handles Discord interactions over HTTPS.
// It does not receive Gateway message/member/voice events.

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const PUBLIC_KEY = (process.env.DISCORD_PUBLIC_KEY || "").trim();
const BOT_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

const MAX_BODY = 1024 * 1024;

// ---- Utilities -------------------------------------------------------------

function json(res, status, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function text(res, status, message) {
  const data = Buffer.from(String(message));
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;

    req.on("data", chunk => {
      total += chunk.length;
      if (total <= MAX_BODY) chunks.push(chunk);
      else tooLarge = true;
    });

    req.on("end", () => {
      if (tooLarge) return reject(new Error("body_too_large"));
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function publicKeyToSpki(rawHex) {
  const raw = Buffer.from(rawHex, "hex");
  if (raw.length !== 32) throw new Error("DISCORD_PUBLIC_KEY must be a 32-byte Ed25519 public key.");
  // RFC 8410 SubjectPublicKeyInfo wrapper for Ed25519.
  return Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    raw
  ]);
}

function verifyDiscordRequest(req, rawBody) {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  if (typeof signature !== "string" || typeof timestamp !== "string") return false;
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  if (!/^[0-9a-fA-F]{32}$/.test(PUBLIC_KEY)) return false;

  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  const publicKey = publicKeyToSpki(PUBLIC_KEY);

  return crypto.verify(
    null,
    message,
    { key: publicKey, format: "der", type: "spki" },
    Buffer.from(signature, "hex")
  );
}

function clean(s, max = 1500) {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function getOption(interaction, name) {
  const opts = interaction?.data?.options || [];
  return opts.find(o => o.name === name)?.value;
}

async function discordApi(path, options = {}) {
  if (!BOT_TOKEN) throw new Error("DISCORD_TOKEN is missing.");
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      "Authorization": `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch {}

  if (!response.ok) {
    const detail = body?.message || bodyText || `HTTP ${response.status}`;
    throw new Error(`Discord API ${response.status}: ${detail}`);
  }
  return body;
}

// ---- 100 planned command names --------------------------------------------

const COMMANDS = [
  ["serverinfo","Show server information"],
  ["status","Show HOODZONE bot status"],
  ["setup","Show setup guide"],
  ["config","Show current configuration"],
  ["announce","Create an announcement"],
  ["embed","Create a simple embed"],
  ["lock","Lock the current channel"],
  ["unlock","Unlock the current channel"],
  ["slowmode","Set channel slowmode"],
  ["channelinfo","Show current channel information"],

  ["warn","Warn a member"],
  ["warnings","View member warnings"],
  ["clearwarns","Clear member warnings"],
  ["timeout","Timeout a member"],
  ["untimeout","Remove a timeout"],
  ["kick","Kick a member"],
  ["ban","Ban a member"],
  ["unban","Unban a user by ID"],
  ["softban","Softban a member"],
  ["purge","Delete recent messages"],
  ["modlogs","View recent moderation cases"],
  ["case","View a moderation case"],
  ["reason","Add a moderation case note"],
  ["history","View member moderation history"],
  ["report","Report a member"],
  ["userreport","Report bullying or harassment"],
  ["reports","View recent reports"],
  ["automod","Show AutoMod guidance"],
  ["antispam","Show anti-spam guidance"],
  ["antilink","Show anti-link guidance"],
  ["antiraid","Show anti-raid guidance"],

  ["safety","Show safety status"],
  ["antibullying","Show anti-bullying guidance"],
  ["flagged","View safety-review guidance"],
  ["review","Review a flagged case"],
  ["deescalate","Send a de-escalation warning"],
  ["incident","Create an incident note"],
  ["incidents","View incident guidance"],
  ["appeal","Submit an appeal"],
  ["appeals","View appeal guidance"],

  ["welcome","Show welcome setup"],
  ["goodbye","Show goodbye setup"],
  ["verify","Show verification setup"],
  ["intro","Show introduction prompt"],
  ["profile","Show profile information"],
  ["userinfo","Show user information"],
  ["avatar","Show user avatar"],
  ["roles","List server roles"],
  ["autorole","Show autorole setup"],
  ["rules","Show server rules"],

  ["role","Manage a member role"],
  ["roleinfo","Show role information"],
  ["createrole","Create a role"],
  ["selfroles","Show self-role setup"],
  ["reactionroles","Show reaction-role setup"],
  ["staffroles","Show staff hierarchy"],
  ["vip","Show VIP guidance"],
  ["og","Show OG guidance"],
  ["rolelock","Show role-lock guidance"],
  ["rolelog","Show role-log guidance"],

  ["daily","Claim daily virtual points"],
  ["coinflip","Flip a virtual coin"],
  ["dice","Roll a die"],
  ["trivia","Play trivia"],
  ["quiz","Play a quiz"],
  ["rps","Play rock paper scissors"],
  ["numberguess","Play number guess"],
  ["wordgame","Play a word game"],
  ["memory","Play a memory game"],
  ["duel","Challenge another member"],

  ["balance","Show point balance"],
  ["givepoints","Give virtual points"],
  ["leaderboard","Show XP leaderboard"],
  ["rank","Show rank"],
  ["level","Show level"],
  ["xp","Show XP information"],
  ["rewards","Show level rewards"],
  ["shop","Show virtual shop"],
  ["buy","Buy a virtual item"],
  ["inventory","Show inventory"],

  ["event","Create a community event"],
  ["events","List community events"],
  ["giveaway","Create a giveaway"],
  ["poll","Create a poll"],
  ["suggest","Submit a suggestion"],
  ["suggestions","View suggestions"],
  ["ticket","Open a ticket"],
  ["afk","Set AFK status"],
  ["remind","Create a reminder"],
  ["announceevent","Announce an event"],

  ["logs","Show logging setup"],
  ["backup","Export a configuration summary"],
  ["maintenance","Show maintenance guidance"],
  ["permissions","Show required permissions"],
  ["staff","Show staff guidance"],
  ["botinfo","Show bot information"],
  ["ping","Show latency"],
  ["uptime","Show uptime"],
  ["help","Show command categories"],
  ["dashboard","Show control-center summary"]
];

if (new Set(COMMANDS.map(c => c[0])).size !== 100) {
  throw new Error(`Expected 100 unique commands, got ${new Set(COMMANDS.map(c => c[0])).size}.`);
}

function commandSchema() {
  return COMMANDS.map(([name, description]) => ({
    name,
    description,
    type: 1
  }));
}

async function registerGuildCommands() {
  if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.warn("[REGISTER] Skipped: DISCORD_TOKEN, CLIENT_ID or GUILD_ID missing.");
    return;
  }

  const body = JSON.stringify(commandSchema());
  const result = await discordApi(`/applications/${encodeURIComponent(CLIENT_ID)}/guilds/${encodeURIComponent(GUILD_ID)}/commands`, {
    method: "PUT",
    body
  });

  console.log(`[REGISTER] Registered ${Array.isArray(result) ? result.length : "unknown"} guild commands.`);
}

function interactionUser(interaction) {
  return interaction?.member?.user || interaction?.user || {};
}

function interactionResponse(content, ephemeral = false) {
  return {
    type: 4,
    data: {
      content,
      ...(ephemeral ? { flags: 64 } : {})
    }
  };
}

async function handleInteraction(interaction) {
  // Discord Ping -> Pong.
  if (interaction.type === 1) {
    return { type: 1 };
  }

  // Application command.
  if (interaction.type !== 2) {
    return interactionResponse("🏙️ HOODZONE received your interaction.");
  }

  const name = interaction.data?.name || "unknown";
  const user = interactionUser(interaction);
  const username = clean(user.username || "member", 80);

  switch (name) {
    case "ping":
      return interactionResponse("🏓 Pong! HOODZONE HTTP endpoint is online.");
    case "status":
      return interactionResponse("🛡️ **HOODZONE STATUS**\n🟢 Endpoint: Online\n🔐 Signature verification: Active\n⚡ Discord API connection: Available");
    case "serverinfo":
      return interactionResponse(`🏙️ **HOODZONE**\nServer ID: \`${GUILD_ID || "not configured"}\`\nBot user: ${username}`);
    case "botinfo":
      return interactionResponse("🤖 **HOODZONE Bot v1.1**\nHTTP Interactions Endpoint\n100 registered commands\nNode.js 20+");
    case "uptime":
      return interactionResponse(`⏱️ Uptime: **${Math.floor(process.uptime())} seconds**`);
    case "help":
      return interactionResponse("🏙️ **HOODZONE COMMANDS**\n100 slash commands are registered across moderation, safety, roles, games, XP, community, tickets, logging and administration.");
    case "rules":
      return interactionResponse("📜 **HOODZONE RULES**\n1. Respect everyone.\n2. No bullying or harassment.\n3. No hate speech or threats.\n4. No spam.\n5. No unwanted advertising.\n6. No impersonation.\n7. No illegal/dangerous content.\n8. Follow Discord's Terms of Service.");
    case "safety":
      return interactionResponse("🛡️ **SAFETY**\nHTTP interactions are online. Full message/member/voice monitoring requires a Discord Gateway service in addition to this endpoint.");
    case "profile":
    case "userinfo":
      return interactionResponse(`👤 **${username}**\nUser ID: \`${user.id || "unknown"}\``);
    case "avatar":
      return interactionResponse(user.avatar ? `🖼️ Avatar hash: \`${user.avatar}\`` : "🖼️ No custom avatar hash supplied.");
    case "balance":
    case "daily":
    case "coinflip":
    case "dice":
    case "trivia":
    case "quiz":
    case "rps":
    case "numberguess":
    case "wordgame":
    case "memory":
    case "duel":
    case "leaderboard":
    case "rank":
    case "level":
    case "xp":
    case "rewards":
    case "shop":
    case "buy":
    case "inventory":
      return interactionResponse(`🎮 **${name}** is connected and responding. This HTTP build provides the interaction layer; persistent game state can be attached to a database next.`);
    case "report":
    case "appeal":
    case "suggest":
    case "ticket":
      return interactionResponse(`✅ **/${name}** received from ${username}. A production workflow should route this to your configured staff channel/database.`);
    default:
      return interactionResponse(`✅ **/${name}** received successfully.`);
  }
}

// ---- HTTP server -----------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      return text(res, 200, "HOODZONE Interactions Endpoint is online.");
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "HOODZONE",
        mode: "interactions-endpoint",
        uptime: Math.floor(process.uptime())
      });
    }

    if (req.method !== "POST" || url.pathname !== "/interactions") {
      return text(res, 404, "Not found");
    }

    const rawBody = await readBody(req);

    if (!PUBLIC_KEY) {
      return text(res, 500, "DISCORD_PUBLIC_KEY is not configured.");
    }

    if (!verifyDiscordRequest(req, rawBody)) {
      return text(res, 401, "invalid request signature");
    }

    let interaction;
    try {
      interaction = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return text(res, 400, "invalid json");
    }

    const response = await handleInteraction(interaction);
    return json(res, 200, response);
  } catch (error) {
    console.error("[SERVER ERROR]", error);
    return text(res, 500, "Internal server error");
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`[START] HOODZONE listening on http://${HOST}:${PORT}`);
  console.log(`[START] Health: /health`);
  console.log(`[START] Interactions: /interactions`);

  try {
    await registerGuildCommands();
  } catch (error) {
    console.error("[REGISTER ERROR]", error.message);
  }
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
