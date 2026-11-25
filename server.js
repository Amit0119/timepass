const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ================= SECURITY HEADERS & MIDDLEWARE =================

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const useDB = Boolean(process.env.DATABASE_URL);
let pool = null;

if (useDB) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}

// Local Memory Fallback Stores (used when DATABASE_URL is not set)
const memoryUsers = [];
const memoryFriendships = [];
const memoryMessages = [];
const memorySubscriptions = new Map();
const memoryMedia = new Map();
let msgIdCounter = 1;

const MASTER_RECOVERY_PIN = process.env.MASTER_RECOVERY_PIN || '0119';
const LOCAL_VAPID_FILE = path.join(__dirname, '.vapid.json');
let vapidKeys = null;
let tokenSecret = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

// ================= SHARED CUSTOM GAME SONGS STORE =================

const gameAudioStore = {
  win: { buffer: null, mime: null, name: null, setBy: null, startSec: 0, updatedAt: 0 },
  lose: { buffer: null, mime: null, name: null, setBy: null, startSec: 0, updatedAt: 0 }
};

function getGameAudioMeta() {
  return {
    win: gameAudioStore.win.buffer
      ? {
          name: gameAudioStore.win.name,
          setBy: gameAudioStore.win.setBy,
          startSec: gameAudioStore.win.startSec,
          updatedAt: gameAudioStore.win.updatedAt
        }
      : null,
    lose: gameAudioStore.lose.buffer
      ? {
          name: gameAudioStore.lose.name,
          setBy: gameAudioStore.lose.setBy,
          startSec: gameAudioStore.lose.startSec,
          updatedAt: gameAudioStore.lose.updatedAt
        }
      : null
  };
}

function clearGameAudioMemory(type) {
  const targets = type ? [type] : ['win', 'lose'];
  targets.forEach((t) => {
    gameAudioStore[t] = { buffer: null, mime: null, name: null, setBy: null, startSec: 0, updatedAt: 0 };
  });
}

function broadcastGameAudioMeta(notifyText = null) {
  const meta = getGameAudioMeta();
  for (const uname of userSockets.keys()) {
    emitToUser(uname, 'game-audio-sync', { audio: meta, notifyText });
  }
}

// ================= SHARED EXTRAS (THEMES, INDEPENDENT PET NAMES, STICKY, HANDS, CHAOS) =================

const ALLOWED_THEMES = ['rose', 'rain', 'galaxy', 'sakura', 'sunset'];

const sharedExtras = {
  theme: 'rose',
  chaosMode: false,
  handsHolding: {},
  pet: {
    names: {}, // Each user keeps their own independent pet name (lowerUsername -> custom name)
    level: 1,
    xp: 0,
    hunger: 82,
    happiness: 86,
    streak: 1,
    lastFedDate: null,
    lastInteraction: Date.now()
  },
  sticky: {
    note: 'Drink water & smile today! 💖',
    updatedBy: 'MINI-WORLD',
    countdownTitle: '',
    countdownDate: ''
  }
};

function getComputedPetState(forUsername = '') {
  const p = sharedExtras.pet;
  if (!p.names || typeof p.names !== 'object') p.names = {};

  const now = Date.now();
  const hoursPassed = Math.max(0, (now - (p.lastInteraction || now)) / (1000 * 60 * 60));
  const hunger = Math.max(10, Math.round(p.hunger - hoursPassed * 2.5));
  const happiness = Math.max(10, Math.round(p.happiness - hoursPassed * 2.0));

  let mood = 'happy';
  if (hunger <= 30) mood = 'hungry';
  else if (happiness <= 35) mood = 'grumpy';
  else if (hoursPassed > 8) mood = 'sleepy';

  const me = String(forUsername || '').toLowerCase();
  const myPetName = (me && p.names[me]) ? p.names[me] : 'Mochi';

  return {
    name: myPetName,
    names: { ...p.names },
    level: p.level,
    xp: p.xp,
    hunger,
    happiness,
    streak: p.streak,
    mood
  };
}

async function persistAppConfig(key, obj) {
  if (!useDB) return;
  try {
    await pool.query(
      `INSERT INTO app_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, JSON.stringify(obj)]
    );
  } catch (e) {
    console.error(`Config save error (${key}):`, e.message);
  }
}

function getHandsState() {
  const holders = Object.entries(sharedExtras.handsHolding)
    .filter(([, isHolding]) => Boolean(isHolding))
    .map(([uname]) => uname);
  return { holders, synced: holders.length >= 2 };
}

// ================= SHARED GAME MODE & DOODLE STATE =================

const ALLOWED_TTT_EMOJIS = ['❤️', '✨', '🐱', '👑', '🔥', '🦋', '🍕', '🐼'];
const ALLOWED_REACTIONS = ['😂', '😭', '❤️', '🤯', '🔥', '🍿'];
const TTT_WINNER_DARES = [
  'Loser owes a cute compliment right now!',
  'Loser has to plan the next movie or coffee date!',
  'Loser must send a sweet voice note or heart shower!',
  'Loser treats the winner to their favorite snack!',
  'Loser has to pick the next song/video to watch together!',
  'Loser owes 3 nice things about the winner in chat!'
];

const BOMB_EXPLODE_DARES = [
  'BOOM! Send a 5-second funny voice note right now!',
  'BOOM! Type a dramatic apology for losing!',
  'BOOM! Draw a cute portrait of your partner in Doodle tab!',
  'BOOM! Treat your partner to their favorite snack next meet!',
  'BOOM! Send a secret scratch message with a sweet compliment!',
  'BOOM! Let your partner choose the next YouTube video!'
];

let catchTimerHandle = null;
let bombTimerHandle = null;

const serverGameState = {
  ttt: {
    board: Array(9).fill(null),
    turnUser: null,
    winnerUser: null,
    winnerSymbol: null,
    isDraw: false,
    symbols: {},
    scores: {},
    lastDare: null
  },
  mind: {
    promptIndex: 0,
    customPrompt: null,
    answers: {},
    revealed: false,
    streak: 0,
    matched: false
  },
  rps: {
    round: 1,
    picks: {},
    scores: {},
    lastResult: null,
    matchWinner: null
  },
  catchGame: {
    active: false,
    endTime: 0,
    scores: {},
    winnerUser: null
  },
  bomb: {
    active: false,
    holder: null,
    holderName: null,
    tapsDone: 0,
    tapsNeeded: 5,
    passes: 0,
    explodedOn: null,
    explodedName: null,
    dare: null,
    roundId: 0
  },
  likely: {
    questionIndex: 0,
    customQuestion: null,
    picks: {},
    revealed: false,
    totalRounds: 0,
    matchCount: 0,
    matched: false
  },
  ytVideoId: null,
  doodleStrokes: []
};

function resetAllGameState() {
  if (catchTimerHandle) {
    clearTimeout(catchTimerHandle);
    catchTimerHandle = null;
  }
  if (bombTimerHandle) {
    clearTimeout(bombTimerHandle);
    bombTimerHandle = null;
  }
  serverGameState.ttt = {
    board: Array(9).fill(null),
    turnUser: null,
    winnerUser: null,
    winnerSymbol: null,
    isDraw: false,
    symbols: {},
    scores: {},
    lastDare: null
  };
  serverGameState.mind = {
    promptIndex: 0,
    customPrompt: null,
    answers: {},
    revealed: false,
    streak: 0,
    matched: false
  };
  serverGameState.rps = {
    round: 1,
    picks: {},
    scores: {},
    lastResult: null,
    matchWinner: null
  };
  serverGameState.catchGame = {
    active: false,
    endTime: 0,
    scores: {},
    winnerUser: null
  };
  serverGameState.bomb = {
    active: false,
    holder: null,
    holderName: null,
    tapsDone: 0,
    tapsNeeded: 5,
    passes: 0,
    explodedOn: null,
    explodedName: null,
    dare: null,
    roundId: 0
  };
  serverGameState.likely = {
    questionIndex: 0,
    customQuestion: null,
    picks: {},
    revealed: false,
    totalRounds: 0,
    matchCount: 0,
    matched: false
  };
  serverGameState.ytVideoId = null;
  serverGameState.doodleStrokes = [];
  sharedExtras.handsHolding = {};
  sharedExtras.chaosMode = false;
  clearGameAudioMemory();
}

function getPublicMindState(forUsername) {
  const m = serverGameState.mind;
  const me = String(forUsername || '').toLowerCase();
  const maskedAnswers = {};
  for (const [key, val] of Object.entries(m.answers)) {
    maskedAnswers[key] = {
      name: val.name,
      locked: true,
      text: m.revealed || key === me ? val.text : null
    };
  }
  return {
    promptIndex: m.promptIndex,
    customPrompt: m.customPrompt,
    answers: maskedAnswers,
    revealed: m.revealed,
    streak: m.streak,
    matched: m.matched
  };
}

function getPublicRpsState(forUsername) {
  const r = serverGameState.rps;
  const me = String(forUsername || '').toLowerCase();
  return {
    round: r.round,
    lockedUsers: Object.keys(r.picks),
    myPick: r.picks[me] || null,
    scores: r.scores,
    lastResult: r.lastResult,
    matchWinner: r.matchWinner
  };
}

function getPublicLikelyState(forUsername) {
  const l = serverGameState.likely;
  const me = String(forUsername || '').toLowerCase();
  const maskedPicks = {};
  for (const [key, val] of Object.entries(l.picks)) {
    maskedPicks[key] = {
      name: val.name,
      locked: true,
      picked: l.revealed || key === me ? val.picked : null
    };
  }
  const compatibility = l.totalRounds > 0 ? Math.round((l.matchCount / l.totalRounds) * 100) : 100;
  return {
    questionIndex: l.questionIndex,
    customQuestion: l.customQuestion,
    picks: maskedPicks,
    revealed: l.revealed,
    totalRounds: l.totalRounds,
    matchCount: l.matchCount,
    matched: l.matched,
    compatibility
  };
}

function ensureTTTSymbols(userA, userB) {
  const a = String(userA).toLowerCase();
  const b = String(userB).toLowerCase();
  const first = a < b ? a : b;
  const second = a < b ? b : a;

  if (!serverGameState.ttt.symbols[first]) {
    serverGameState.ttt.symbols[first] = '❤️';
  }
  if (!serverGameState.ttt.symbols[second] || serverGameState.ttt.symbols[second] === serverGameState.ttt.symbols[first]) {
    const fallback = ALLOWED_TTT_EMOJIS.find(e => e !== serverGameState.ttt.symbols[first]) || '✨';
    serverGameState.ttt.symbols[second] = fallback;
  }
  if (!serverGameState.ttt.turnUser) {
    serverGameState.ttt.turnUser = first;
  }
}

function checkTTTWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// ================= CRYPTO & SECURITY HELPERS =================

function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifySecret(plain, stored) {
  if (!plain || !stored) return false;
  if (!String(stored).startsWith('scrypt:')) {
    return String(plain) === String(stored);
  }
  const parts = String(stored).split(':');
  if (parts.length !== 3) return false;
  const [, salt, originalHash] = parts;
  const derived = crypto.scryptSync(String(plain), salt, 64);
  const originalBuf = Buffer.from(originalHash, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

function createAuthToken(username) {
  const clean = String(username).toLowerCase().trim();
  const sig = crypto.createHmac('sha256', tokenSecret).update(clean).digest('hex');
  return `${clean}.${sig}`;
}

function verifyAuthToken(username, token) {
  if (!username || !token || typeof token !== 'string') return false;
  const expected = createAuthToken(username);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const authAttempts = new Map();
function checkRateLimit(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket.remoteAddress || 'local';
  const now = Date.now();

  if (authAttempts.size > 500) {
    for (const [k, v] of authAttempts.entries()) {
      if (now > v.resetAt) authAttempts.delete(k);
    }
  }

  const entry = authAttempts.get(ip) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 10 * 60 * 1000;
  }
  entry.count += 1;
  authAttempts.set(ip, entry);
  if (entry.count > 20) {
    res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
    return false;
  }
  return true;
}

function loadOrCreateLocalVapidKeys() {
  try {
    if (fs.existsSync(LOCAL_VAPID_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_VAPID_FILE, 'utf8'));
    }
  } catch (e) {}
  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(LOCAL_VAPID_FILE, JSON.stringify(generated, null, 2));
  } catch (e) {}
  return generated;
}

function safeDecodeHeader(val) {
  try {
    return decodeURIComponent(String(val || ''));
  } catch (e) {
    return String(val || '');
  }
}

async function initDB() {
  if (!useDB) {
    vapidKeys = loadOrCreateLocalVapidKeys();
    tokenSecret = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(vapidKeys.privateKey).digest('hex');
    webpush.setVapidDetails('mailto:admin@miniworld.app', vapidKeys.publicKey, vapidKeys.privateKey);
    console.log('Running in local memory mode with persistent VAPID & security keys.');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        recovery_code VARCHAR(255) DEFAULT '0119',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        requester VARCHAR(50) NOT NULL,
        recipient VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_friendship UNIQUE (requester, recipient)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50),
        recipient VARCHAR(50),
        text TEXT NOT NULL,
        reply_to JSONB DEFAULT NULL,
        seen BOOLEAN DEFAULT FALSE,
        reaction VARCHAR(16) DEFAULT NULL,
        msg_type VARCHAR(20) DEFAULT 'text',
        media_id VARCHAR(64) DEFAULT NULL,
        media_viewed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_media (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        recipient VARCHAR(50) NOT NULL,
        media_type VARCHAR(20) NOT NULL,
        mime VARCHAR(64) NOT NULL,
        data TEXT NOT NULL,
        view_once BOOLEAN DEFAULT FALSE,
        viewed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        endpoint TEXT UNIQUE NOT NULL,
        subscription TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await pool.query(`ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code VARCHAR(255) DEFAULT '0119';`);
    await pool.query(`ALTER TABLE users ALTER COLUMN recovery_code TYPE VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS username VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reaction VARCHAR(16) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type VARCHAR(20) DEFAULT 'text';`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_id VARCHAR(64) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_viewed BOOLEAN DEFAULT FALSE;`);

    const vapidRes = await pool.query(`SELECT value FROM app_config WHERE key = 'vapid_keys'`);
    if (vapidRes.rows.length > 0) {
      vapidKeys = JSON.parse(vapidRes.rows[0].value);
    } else {
      vapidKeys = loadOrCreateLocalVapidKeys();
      await pool.query(
        `INSERT INTO app_config (key, value) VALUES ('vapid_keys', $1)`,
        [JSON.stringify(vapidKeys)]
      );
    }

    // Restore persisted custom game songs
    for (const type of ['win', 'lose']) {
      const aRes = await pool.query(`SELECT value FROM app_config WHERE key = $1`, [`game_audio_${type}`]);
      if (aRes.rows.length > 0) {
        try {
          const saved = JSON.parse(aRes.rows[0].value);
          if (saved && saved.base64) {
            gameAudioStore[type] = {
              buffer: Buffer.from(saved.base64, 'base64'),
              mime: saved.mime || 'audio/mpeg',
              name: saved.name || 'Custom Song',
              setBy: saved.setBy || 'Partner',
              startSec: Number(saved.startSec) || 0,
              updatedAt: Number(saved.updatedAt) || Date.now()
            };
          }
        } catch (e) {}
      }
    }

    // Restore persisted Theme, Pet, and Sticky Note
    const cfgRes = await pool.query(`SELECT key, value FROM app_config WHERE key IN ('chat_theme', 'couple_pet', 'sticky_note')`);
    for (const row of cfgRes.rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (row.key === 'chat_theme' && ALLOWED_THEMES.includes(parsed.theme)) {
          sharedExtras.theme = parsed.theme;
        } else if (row.key === 'couple_pet' && parsed && typeof parsed === 'object') {
          sharedExtras.pet = {
            ...sharedExtras.pet,
            ...parsed,
            names: (parsed.names && typeof parsed.names === 'object') ? parsed.names : {}
          };
        } else if (row.key === 'sticky_note' && parsed && typeof parsed === 'object') {
          sharedExtras.sticky = { ...sharedExtras.sticky, ...parsed };
        }
      } catch (e) {}
    }

    tokenSecret = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(vapidKeys.privateKey).digest('hex');

    webpush.setVapidDetails(
      'mailto:admin@miniworld.app',
      process.env.VAPID_PUBLIC_KEY || vapidKeys.publicKey,
      process.env.VAPID_PRIVATE_KEY || vapidKeys.privateKey
    );

    console.log('Database, Security, Media, Pet, Themes & Web-Push initialized.');
  } catch (err) {
    console.error('Database initialization error:', err);
    vapidKeys = loadOrCreateLocalVapidKeys();
    tokenSecret = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(vapidKeys.privateKey).digest('hex');
    webpush.setVapidDetails('mailto:admin@miniworld.app', vapidKeys.publicKey, vapidKeys.privateKey);
  }
}

// ================= VOICE NOTES & PHOTO (VIEW-ONCE) MEDIA ROUTES =================

app.post(
  '/chat-media',
  express.raw({ type: '*/*', limit: '4mb' }),
  async (req, res) => {
    try {
      const username = safeDecodeHeader(req.headers['x-auth-user']).trim();
      const token = String(req.headers['x-auth-token'] || '');
      const to = safeDecodeHeader(req.headers['x-media-to']).trim();
      const mediaType = String(req.headers['x-media-type'] || 'photo').trim();
      const caption = safeDecodeHeader(req.headers['x-media-caption']).trim().slice(0, 200);

      if (!verifyAuthToken(username, token)) {
        return res.status(401).json({ error: 'Unauthorized media upload.' });
      }
      if (!to || !(await areFriends(username, to))) {
        return res.status(403).json({ error: 'Partner connection required.' });
      }
      if (!['voice', 'photo', 'view_once'].includes(mediaType)) {
        return res.status(400).json({ error: 'Unsupported media type.' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Empty file.' });
      }
      if (req.body.length > 4 * 1024 * 1024) {
        return res.status(413).json({ error: 'File must be under 4 MB.' });
      }

      const rawMime = String(req.headers['content-type'] || '').split(';')[0].trim();
      const mime = mediaType === 'voice'
        ? (rawMime.startsWith('audio/') ? rawMime : 'audio/webm')
        : (rawMime.startsWith('image/') ? rawMime : 'image/jpeg');

      const viewOnce = mediaType === 'view_once';
      const mediaId = crypto.randomBytes(12).toString('hex');

      const fallbackText = mediaType === 'voice'
        ? (caption || 'Voice note')
        : (viewOnce ? (caption || 'View-once photo') : (caption || 'Photo'));

      let savedMsg = null;

      if (useDB) {
        await pool.query(
          `INSERT INTO chat_media (id, username, recipient, media_type, mime, data, view_once, viewed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
          [mediaId, username, to, mediaType, mime, req.body.toString('base64'), viewOnce]
        );

        const mRes = await pool.query(
          `INSERT INTO messages (username, recipient, text, reply_to, seen, reaction, msg_type, media_id, media_viewed)
           VALUES ($1, $2, $3, NULL, FALSE, NULL, $4, $5, FALSE)
           RETURNING id, username, recipient, text, reply_to, seen, reaction, msg_type, media_id, media_viewed, created_at`,
          [username, to, fallbackText, mediaType, mediaId]
        );
        savedMsg = mRes.rows[0];
      } else {
        memoryMedia.set(mediaId, {
          id: mediaId,
          username,
          recipient: to,
          mediaType,
          mime,
          buffer: req.body,
          viewOnce,
          viewed: false
        });
        savedMsg = {
          id: msgIdCounter++,
          username,
          recipient: to,
          text: fallbackText,
          reply_to: null,
          seen: false,
          reaction: null,
          msg_type: mediaType,
          media_id: mediaId,
          media_viewed: false,
          created_at: new Date().toISOString()
        };
        memoryMessages.push(savedMsg);
      }

      emitToUser(username, 'private-message', savedMsg);
      if (isUserOnline(to)) {
        emitToUser(to, 'private-message', savedMsg);
        const recipientSocial = await getSocialDataForUser(to);
        emitToUser(to, 'social-data', recipientSocial);
      }

      sendPushNotification(to, {
        title: username,
        body: mediaType === 'voice' ? '🎙️ Sent a voice note' : (viewOnce ? '🔥 Sent a view-once photo' : '📷 Sent a photo'),
        tag: `chat-${username}`
      });

      return res.json({ success: true, message: savedMsg });
    } catch (err) {
      console.error('Chat media upload error:', err);
      return res.status(500).json({ error: 'Failed to send media.' });
    }
  }
);

app.get('/chat-media/:id', async (req, res) => {
  try {
    const mediaId = String(req.params.id || '').trim();
    const username = String(req.query.u || '').trim();
    const token = String(req.query.t || '');
    if (!mediaId || !verifyAuthToken(username, token)) {
      return res.status(401).end();
    }

    let entry = null;
    if (useDB) {
      const mRes = await pool.query(
        `SELECT id, username, recipient, media_type, mime, data, view_once, viewed
         FROM chat_media WHERE id = $1`,
        [mediaId]
      );
      if (mRes.rows.length === 0) return res.status(404).end();
      const row = mRes.rows[0];
      entry = {
        username: row.username,
        recipient: row.recipient,
        mime: row.mime,
        buffer: row.data ? Buffer.from(row.data, 'base64') : null,
        viewOnce: Boolean(row.view_once),
        viewed: Boolean(row.viewed)
      };
    } else {
      entry = memoryMedia.get(mediaId);
      if (!entry) return res.status(404).end();
    }

    const me = username.toLowerCase();
    if (entry.username.toLowerCase() !== me && entry.recipient.toLowerCase() !== me) {
      return res.status(403).end();
    }
    if (entry.viewOnce && entry.viewed) {
      return res.status(410).json({ error: 'View-once photo already opened.' });
    }
    if (!entry.buffer || entry.buffer.length === 0) {
      return res.status(404).end();
    }

    const buf = entry.buffer;
    const total = buf.length;
    const range = req.headers.range;

    res.setHeader('Content-Type', entry.mime || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (isNaN(start) || start >= total || end >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      res.end(buf.subarray(start, end + 1));
    } else {
      res.status(200);
      res.setHeader('Content-Length', total);
      res.end(buf);
    }
  } catch (err) {
    console.error('Get chat media error:', err);
    return res.status(500).end();
  }
});

app.post('/chat-media/:id/consume', async (req, res) => {
  try {
    const mediaId = String(req.params.id || '').trim();
    const username = (req.body?.username || '').trim();
    const token = req.body?.token || req.headers['x-auth-token'] || '';
    if (!mediaId || !verifyAuthToken(username, token)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    let sender = null;
    let recipient = null;

    if (useDB) {
      const mRes = await pool.query(`SELECT username, recipient, view_once FROM chat_media WHERE id = $1`, [mediaId]);
      if (mRes.rows.length === 0) return res.status(404).json({ error: 'Media not found.' });
      const row = mRes.rows[0];
      if (!row.view_once) return res.json({ success: true });
      sender = row.username;
      recipient = row.recipient;

      await pool.query(`UPDATE chat_media SET viewed = TRUE, data = '' WHERE id = $1`, [mediaId]);
      await pool.query(`UPDATE messages SET media_viewed = TRUE WHERE media_id = $1`, [mediaId]);
    } else {
      const entry = memoryMedia.get(mediaId);
      if (!entry) return res.status(404).json({ error: 'Media not found.' });
      if (!entry.viewOnce) return res.json({ success: true });
      sender = entry.username;
      recipient = entry.recipient;
      entry.viewed = true;
      entry.buffer = Buffer.alloc(0);

      memoryMessages.forEach(m => {
        if (m.media_id === mediaId) m.media_viewed = true;
      });
    }

    if (sender) emitToUser(sender, 'media-viewed', { mediaId });
    if (recipient) emitToUser(recipient, 'media-viewed', { mediaId });

    return res.json({ success: true });
  } catch (err) {
    console.error('Consume media error:', err);
    return res.status(500).json({ error: 'Failed to mark media viewed.' });
  }
});

// ================= CUSTOM GAME SONG UPLOAD, STREAMING & DELETE ROUTES =================

app.post(
  '/game-audio/:type',
  express.raw({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    try {
      const type = req.params.type;
      if (type !== 'win' && type !== 'lose') {
        return res.status(400).json({ error: 'Invalid audio slot.' });
      }

      const username = safeDecodeHeader(req.headers['x-auth-user']).trim();
      const token = String(req.headers['x-auth-token'] || '');
      if (!verifyAuthToken(username, token)) {
        return res.status(401).json({ error: 'Unauthorized upload request.' });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Empty audio file.' });
      }
      if (req.body.length > 5 * 1024 * 1024) {
        return res.status(413).json({ error: 'Song file must be under 5 MB.' });
      }

      const rawMime = String(req.headers['content-type'] || 'audio/mpeg').split(';')[0].trim();
      const mime = rawMime.startsWith('audio/') ? rawMime : 'audio/mpeg';
      const fileName = safeDecodeHeader(req.headers['x-audio-name']).trim().slice(0, 80) || 'Custom Song';
      const startSec = Math.max(0, Math.min(3600, Number(req.headers['x-audio-start']) || 0));
      const updatedAt = Date.now();

      gameAudioStore[type] = {
        buffer: req.body,
        mime,
        name: fileName,
        setBy: username,
        startSec,
        updatedAt
      };

      if (useDB) {
        const dbPayload = JSON.stringify({
          base64: req.body.toString('base64'),
          mime,
          name: fileName,
          setBy: username,
          startSec,
          updatedAt
        });
        await pool.query(
          `INSERT INTO app_config (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [`game_audio_${type}`, dbPayload]
        );
      }

      broadcastGameAudioMeta(`${username} set a new ${type === 'win' ? 'Win' : 'Lose'} Song: ${fileName}`);
      return res.json({ success: true, audio: getGameAudioMeta() });
    } catch (err) {
      console.error('Game audio upload error:', err);
      return res.status(500).json({ error: 'Failed to save song. Try a smaller audio clip (under 5 MB).' });
    }
  }
);

app.post('/game-audio-meta/:type', async (req, res) => {
  try {
    const type = req.params.type;
    if (type !== 'win' && type !== 'lose') {
      return res.status(400).json({ error: 'Invalid audio slot.' });
    }
    const username = (req.body?.username || '').trim();
    const token = req.body?.token || req.headers['x-auth-token'] || '';
    if (!verifyAuthToken(username, token)) {
      return res.status(401).json({ error: 'Unauthorized request.' });
    }
    const entry = gameAudioStore[type];
    if (!entry.buffer) {
      return res.status(404).json({ error: 'No song uploaded yet for this slot.' });
    }

    entry.startSec = Math.max(0, Math.min(3600, Number(req.body?.startSec) || 0));
    entry.updatedAt = Date.now();

    if (useDB) {
      const dbPayload = JSON.stringify({
        base64: entry.buffer.toString('base64'),
        mime: entry.mime,
        name: entry.name,
        setBy: entry.setBy,
        startSec: entry.startSec,
        updatedAt: entry.updatedAt
      });
      await pool.query(
        `INSERT INTO app_config (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [`game_audio_${type}`, dbPayload]
      );
    }

    broadcastGameAudioMeta(`${username} updated ${type === 'win' ? 'Win' : 'Lose'} Song start time.`);
    return res.json({ success: true, audio: getGameAudioMeta() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update start time.' });
  }
});

app.get('/game-audio/:type', (req, res) => {
  const type = req.params.type;
  if (type !== 'win' && type !== 'lose') return res.status(400).end();

  const username = String(req.query.u || '').trim();
  const token = String(req.query.t || '');
  if (!verifyAuthToken(username, token)) {
    return res.status(401).end();
  }

  const entry = gameAudioStore[type];
  if (!entry || !entry.buffer) return res.status(404).end();

  const buf = entry.buffer;
  const total = buf.length;
  const range = req.headers.range;

  res.setHeader('Content-Type', entry.mime || 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    if (isNaN(start) || start >= total || end >= total || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    res.end(buf.subarray(start, end + 1));
  } else {
    res.status(200);
    res.setHeader('Content-Length', total);
    res.end(buf);
  }
});

app.delete('/game-audio/:type', async (req, res) => {
  try {
    const type = req.params.type;
    if (type !== 'win' && type !== 'lose') {
      return res.status(400).json({ error: 'Invalid audio slot.' });
    }
    const username = safeDecodeHeader(req.headers['x-auth-user']).trim();
    const token = String(req.headers['x-auth-token'] || '');
    if (!verifyAuthToken(username, token)) {
      return res.status(401).json({ error: 'Unauthorized request.' });
    }

    clearGameAudioMemory(type);
    if (useDB) {
      await pool.query(`DELETE FROM app_config WHERE key = $1`, [`game_audio_${type}`]);
    }

    broadcastGameAudioMeta(`${username} cleared the ${type === 'win' ? 'Win' : 'Lose'} Song.`);
    return res.json({ success: true, audio: getGameAudioMeta() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove song.' });
  }
});

// ================= WEB PUSH ROUTES =================

app.get('/vapid-public-key', (req, res) => {
  if (!vapidKeys) return res.status(503).json({ error: 'Push service initializing' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || vapidKeys.publicKey });
});

app.post('/subscribe', async (req, res) => {
  try {
    const username = (req.body?.username || '').trim();
    const token = req.body?.token || req.headers['x-auth-token'] || '';
    const subscription = req.body?.subscription;

    if (!username || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }
    if (!verifyAuthToken(username, token)) {
      return res.status(401).json({ error: 'Unauthorized subscription request' });
    }

    if (useDB) {
      await pool.query(
        `INSERT INTO push_subscriptions (username, endpoint, subscription)
         VALUES ($1, $2, $3)
         ON CONFLICT (endpoint) DO UPDATE SET username = $1, subscription = $3`,
        [username, subscription.endpoint, JSON.stringify(subscription)]
      );
    } else {
      const key = username.toLowerCase();
      const list = memorySubscriptions.get(key) || [];
      const filtered = list.filter(s => s.endpoint !== subscription.endpoint);
      filtered.push(subscription);
      memorySubscriptions.set(key, filtered);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/test-push', async (req, res) => {
  try {
    const username = (req.body?.username || '').trim();
    const token = req.body?.token || req.headers['x-auth-token'] || '';

    if (!username) return res.status(400).json({ error: 'Username required' });
    if (!verifyAuthToken(username, token)) {
      return res.status(401).json({ error: 'Unauthorized request' });
    }

    const sentCount = await sendPushNotification(username, {
      title: 'MINI-WORLD',
      body: 'Background notifications are active on your device!',
      tag: 'push-test',
      forceShow: true
    });

    if (sentCount === 0) {
      return res.status(404).json({ error: 'No active push subscription found. Re-syncing...' });
    }
    res.json({ success: true, sentCount });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Push test failed' });
  }
});

async function sendPushNotification(targetUsername, payloadObj) {
  if (!vapidKeys || !targetUsername) return 0;
  const payload = JSON.stringify(payloadObj);
  let successCount = 0;

  try {
    if (useDB) {
      const res = await pool.query(
        'SELECT endpoint, subscription FROM push_subscriptions WHERE LOWER(username) = LOWER($1)',
        [targetUsername]
      );
      for (const row of res.rows) {
        try {
          await webpush.sendNotification(JSON.parse(row.subscription), payload);
          successCount++;
        } catch (err) {
          if ([400, 401, 403, 404, 410].includes(err.statusCode)) {
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
          }
        }
      }
    } else {
      const key = targetUsername.toLowerCase();
      const list = memorySubscriptions.get(key) || [];
      const valid = [];
      for (const sub of list) {
        try {
          await webpush.sendNotification(sub, payload);
          valid.push(sub);
          successCount++;
        } catch (err) {
          if (![400, 401, 403, 404, 410].includes(err.statusCode)) {
            valid.push(sub);
          }
        }
      }
      memorySubscriptions.set(key, valid);
    }
  } catch (err) {
    console.error('Push dispatch error:', err.message);
  }
  return successCount;
}

// ================= AUTO-CONNECT 2 VIP ACCOUNTS =================

async function ensureVIPAutoConnected() {
  try {
    if (useDB) {
      const uRes = await pool.query('SELECT username FROM users ORDER BY id ASC LIMIT 2');
      if (uRes.rows.length === 2) {
        const u1 = uRes.rows[0].username;
        const u2 = uRes.rows[1].username;
        const fRes = await pool.query(
          `SELECT id, status FROM friendships
           WHERE (LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(requester) = LOWER($2) AND LOWER(recipient) = LOWER($1))`,
          [u1, u2]
        );
        if (fRes.rows.length === 0) {
          await pool.query(
            `INSERT INTO friendships (requester, recipient, status) VALUES ($1, $2, 'accepted')`,
            [u1, u2]
          );
        } else if (fRes.rows[0].status !== 'accepted') {
          await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [fRes.rows[0].id]);
        }
      }
    } else if (memoryUsers.length === 2) {
      const u1 = memoryUsers[0].username;
      const u2 = memoryUsers[1].username;
      const rel = memoryFriendships.find(
        f => (f.requester.toLowerCase() === u1.toLowerCase() && f.recipient.toLowerCase() === u2.toLowerCase()) ||
             (f.requester.toLowerCase() === u2.toLowerCase() && f.recipient.toLowerCase() === u1.toLowerCase())
      );
      if (!rel) {
        memoryFriendships.push({ id: Date.now(), requester: u1, recipient: u2, status: 'accepted' });
      } else {
        rel.status = 'accepted';
      }
    }
  } catch (e) {
    console.error('Auto-connect error:', e);
  }
}

// ================= AUTHENTICATION & ACCOUNT ROUTES =================

app.post('/register', async (req, res) => {
  if (!checkRateLimit(req, res)) return;
  try {
    const username = (req.body?.username || '').trim().replace(/[<>]/g, '');
    const password = req.body?.password || '';
    const recoveryCode = (req.body?.recoveryCode || MASTER_RECOVERY_PIN).trim() || MASTER_RECOVERY_PIN;

    if (!username || username.length < 2 || password.length < 6) {
      return res.status(400).json({ error: 'Username (min 2 chars) and password (min 6 chars) required.' });
    }

    const hashedPass = hashSecret(password);
    const hashedPin = hashSecret(recoveryCode);

    if (useDB) {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username already exists. Please Sign In.' });
      }

      const countRes = await pool.query('SELECT COUNT(*) FROM users');
      if (parseInt(countRes.rows[0].count, 10) >= 2) {
        return res.status(403).json({ error: 'Registration closed. Only 2 private accounts are allowed.' });
      }

      const insertRes = await pool.query(
        'INSERT INTO users (username, password, recovery_code) VALUES ($1, $2, $3) RETURNING username',
        [username, hashedPass, hashedPin]
      );
      const savedUser = insertRes.rows[0].username;
      await ensureVIPAutoConnected();
      return res.json({ success: true, username: savedUser, token: createAuthToken(savedUser) });
    } else {
      if (memoryUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: 'Username already exists. Please Sign In.' });
      }
      if (memoryUsers.length >= 2) {
        return res.status(403).json({ error: 'Registration closed. Only 2 private accounts are allowed.' });
      }
      memoryUsers.push({
        id: memoryUsers.length + 1,
        username,
        password: hashedPass,
        recovery_code: hashedPin,
        last_seen: new Date().toISOString()
      });
      await ensureVIPAutoConnected();
      return res.json({ success: true, username, token: createAuthToken(username) });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/login', async (req, res) => {
  if (!checkRateLimit(req, res)) return;
  try {
    const username = (req.body?.username || '').trim();
    const password = req.body?.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Enter both username and password.' });
    }

    if (useDB) {
      const result = await pool.query(
        'SELECT id, username, password FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (result.rows.length === 0 || !verifySecret(password, result.rows[0].password)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      if (!String(result.rows[0].password).startsWith('scrypt:')) {
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashSecret(password), result.rows[0].id]);
      }
      const savedUser = result.rows[0].username;
      await ensureVIPAutoConnected();
      return res.json({ success: true, username: savedUser, token: createAuthToken(savedUser) });
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user || !verifySecret(password, user.password)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      if (!String(user.password).startsWith('scrypt:')) {
        user.password = hashSecret(password);
      }
      await ensureVIPAutoConnected();
      return res.json({ success: true, username: user.username, token: createAuthToken(user.username) });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during sign in.' });
  }
});

app.post('/change-password', async (req, res) => {
  if (!checkRateLimit(req, res)) return;
  try {
    const username = (req.body?.username || '').trim();
    const oldPassword = req.body?.oldPassword || '';
    const newPassword = req.body?.newPassword || '';
    const newRecoveryCode = (req.body?.newRecoveryCode || '').trim();

    if (!username || !oldPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    if (useDB) {
      const result = await pool.query(
        'SELECT id, password, recovery_code FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (result.rows.length === 0 || !verifySecret(oldPassword, result.rows[0].password)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      const nextPassHash = hashSecret(newPassword);
      const nextPinHash = newRecoveryCode ? hashSecret(newRecoveryCode) : result.rows[0].recovery_code;
      await pool.query(
        'UPDATE users SET password = $1, recovery_code = $2 WHERE id = $3',
        [nextPassHash, nextPinHash, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password updated successfully.' });
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user || !verifySecret(oldPassword, user.password)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      user.password = hashSecret(newPassword);
      if (newRecoveryCode) user.recovery_code = hashSecret(newRecoveryCode);
      return res.json({ success: true, message: 'Password updated successfully.' });
    }
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

app.post('/reset-password', async (req, res) => {
  if (!checkRateLimit(req, res)) return;
  try {
    const username = (req.body?.username || '').trim();
    const recoveryCode = (req.body?.recoveryCode || '').trim();
    const newPassword = req.body?.newPassword || '';

    if (!username || !recoveryCode || newPassword.length < 6) {
      return res.status(400).json({ error: 'Enter username, recovery PIN, and new password (min 6 chars).' });
    }

    if (useDB) {
      const result = await pool.query(
        'SELECT id, recovery_code FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      const savedPin = result.rows[0].recovery_code || MASTER_RECOVERY_PIN;
      const isPinValid = verifySecret(recoveryCode, savedPin) || recoveryCode === MASTER_RECOVERY_PIN;
      if (!isPinValid) {
        return res.status(401).json({ error: 'Invalid recovery PIN.' });
      }
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashSecret(newPassword), result.rows[0].id]);
      return res.json({ success: true, message: 'Password reset complete. Sign in with your new password.' });
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      const savedPin = user.recovery_code || MASTER_RECOVERY_PIN;
      const isPinValid = verifySecret(recoveryCode, savedPin) || recoveryCode === MASTER_RECOVERY_PIN;
      if (!isPinValid) {
        return res.status(401).json({ error: 'Invalid recovery PIN.' });
      }
      user.password = hashSecret(newPassword);
      return res.json({ success: true, message: 'Password reset complete. Sign in with your new password.' });
    }
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error resetting password.' });
  }
});

app.post('/delete-account', async (req, res) => {
  if (!checkRateLimit(req, res)) return;
  try {
    const username = (req.body?.username || '').trim();
    const password = req.body?.password || '';
    const recoveryCode = (req.body?.recoveryCode || req.body?.confirmation || '').trim();

    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    let exactUsername = username;

    if (useDB) {
      const result = await pool.query(
        'SELECT id, username, password, recovery_code FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const user = result.rows[0];
      const savedPin = user.recovery_code || MASTER_RECOVERY_PIN;
      const isPinValid = Boolean(recoveryCode && (verifySecret(recoveryCode, savedPin) || recoveryCode === MASTER_RECOVERY_PIN));
      const isPassValid = Boolean(password && verifySecret(password, user.password));

      if (!isPinValid && !isPassValid) {
        return res.status(401).json({ error: 'Incorrect password or recovery PIN.' });
      }

      exactUsername = user.username;
      await pool.query('DELETE FROM push_subscriptions WHERE LOWER(username) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM chat_media WHERE LOWER(username) = LOWER($1) OR LOWER(recipient) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM messages WHERE LOWER(username) = LOWER($1) OR LOWER(recipient) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM friendships WHERE LOWER(requester) = LOWER($1) OR LOWER(recipient) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
      await pool.query(`DELETE FROM app_config WHERE key IN ('game_audio_win', 'game_audio_lose')`);
    } else {
      const idx = memoryUsers.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
      if (idx === -1) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const user = memoryUsers[idx];
      const savedPin = user.recovery_code || MASTER_RECOVERY_PIN;
      const isPinValid = Boolean(recoveryCode && (verifySecret(recoveryCode, savedPin) || recoveryCode === MASTER_RECOVERY_PIN));
      const isPassValid = Boolean(password && verifySecret(password, user.password));

      if (!isPinValid && !isPassValid) {
        return res.status(401).json({ error: 'Incorrect password or recovery PIN.' });
      }

      exactUsername = user.username;
      memoryUsers.splice(idx, 1);
      memorySubscriptions.delete(exactUsername.toLowerCase());

      for (const [mid, item] of memoryMedia.entries()) {
        if (item.username.toLowerCase() === exactUsername.toLowerCase() || item.recipient.toLowerCase() === exactUsername.toLowerCase()) {
          memoryMedia.delete(mid);
        }
      }

      for (let i = memoryFriendships.length - 1; i >= 0; i--) {
        const f = memoryFriendships[i];
        if (f.requester.toLowerCase() === exactUsername.toLowerCase() || f.recipient.toLowerCase() === exactUsername.toLowerCase()) {
          memoryFriendships.splice(i, 1);
        }
      }

      for (let i = memoryMessages.length - 1; i >= 0; i--) {
        const m = memoryMessages[i];
        if (
          (m.username && m.username.toLowerCase() === exactUsername.toLowerCase()) ||
          (m.recipient && m.recipient.toLowerCase() === exactUsername.toLowerCase())
        ) {
          memoryMessages.splice(i, 1);
        }
      }
    }

    resetAllGameState();

    for (const [uname, set] of userSockets.entries()) {
      if (uname.toLowerCase() === exactUsername.toLowerCase()) {
        for (const sockId of set) {
          const s = io.sockets.sockets.get(sockId);
          if (s) {
            s.emit('account-deleted');
            s.disconnect(true);
          }
        }
        userSockets.delete(uname);
      }
    }

    await broadcastSocialUpdates();
    return res.json({ success: true, message: `Account '${exactUsername}' deleted.` });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Server error deleting account.' });
  }
});

// ================= PRESENCE & SOCIAL HELPERS =================

const userSockets = new Map();

function findSocketKey(username) {
  if (!username) return null;
  const lower = username.toLowerCase();
  for (const key of userSockets.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

function isUserOnline(username) {
  const key = findSocketKey(username);
  if (!key) return false;
  const set = userSockets.get(key);
  return Boolean(set && set.size > 0);
}

function emitToUser(username, event, payload) {
  const key = findSocketKey(username);
  if (!key) return;
  const set = userSockets.get(key);
  if (set) {
    for (const sockId of set) {
      io.to(sockId).emit(event, payload);
    }
  }
}

async function updateLastSeen(username) {
  try {
    if (useDB) {
      await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE LOWER(username) = LOWER($1)', [username]);
    } else {
      const u = memoryUsers.find(x => x.username.toLowerCase() === username.toLowerCase());
      if (u) u.last_seen = new Date().toISOString();
    }
  } catch (e) {}
}

async function getSocialDataForUser(username) {
  await ensureVIPAutoConnected();

  let allUsers = [];
  let relations = [];
  let unreadCounts = {};

  if (useDB) {
    const uRes = await pool.query(
      'SELECT username, last_seen FROM users WHERE LOWER(username) != LOWER($1)',
      [username]
    );
    allUsers = uRes.rows;

    const fRes = await pool.query(
      'SELECT requester, recipient, status FROM friendships WHERE LOWER(requester) = LOWER($1) OR LOWER(recipient) = LOWER($1)',
      [username]
    );
    relations = fRes.rows;

    const unreadRes = await pool.query(
      `SELECT username, COUNT(*) AS cnt
       FROM messages
       WHERE LOWER(recipient) = LOWER($1) AND seen = FALSE
       GROUP BY username`,
      [username]
    );
    unreadRes.rows.forEach(r => {
      unreadCounts[r.username.toLowerCase()] = parseInt(r.cnt, 10);
    });
  } else {
    allUsers = memoryUsers
      .filter(u => u.username.toLowerCase() !== username.toLowerCase())
      .map(u => ({ username: u.username, last_seen: u.last_seen }));
    relations = memoryFriendships.filter(
      f => f.requester.toLowerCase() === username.toLowerCase() || f.recipient.toLowerCase() === username.toLowerCase()
    );
    memoryMessages.forEach(m => {
      if (m.recipient.toLowerCase() === username.toLowerCase() && !m.seen) {
        const k = m.username.toLowerCase();
        unreadCounts[k] = (unreadCounts[k] || 0) + 1;
      }
    });
  }

  const friends = [];
  const requests = [];
  const discover = [];

  for (const userRow of allUsers) {
    const other = userRow.username;
    const rel = relations.find(
      r => (r.requester.toLowerCase() === username.toLowerCase() && r.recipient.toLowerCase() === other.toLowerCase()) ||
           (r.requester.toLowerCase() === other.toLowerCase() && r.recipient.toLowerCase() === username.toLowerCase())
    );

    const online = isUserOnline(other);
    const unread = unreadCounts[other.toLowerCase()] || 0;

    if (!rel) {
      discover.push({ username: other, status: 'none', online, last_seen: userRow.last_seen });
    } else if (rel.status === 'accepted') {
      friends.push({ username: other, online, last_seen: userRow.last_seen, unread });
    } else if (rel.status === 'pending') {
      if (rel.recipient.toLowerCase() === username.toLowerCase()) {
        requests.push({ username: other, online });
      } else {
        discover.push({ username: other, status: 'requested', online });
      }
    }
  }

  return { friends, requests, discover };
}

async function broadcastSocialUpdates() {
  for (const username of userSockets.keys()) {
    try {
      const data = await getSocialDataForUser(username);
      emitToUser(username, 'social-data', data);
    } catch (e) {
      console.error('Error broadcasting social data:', e);
    }
  }
}

async function areFriends(userA, userB) {
  if (!userA || !userB) return false;
  await ensureVIPAutoConnected();
  if (useDB) {
    const res = await pool.query(
      `SELECT 1 FROM friendships
       WHERE ((LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2))
          OR  (LOWER(requester) = LOWER($2) AND LOWER(recipient) = LOWER($1)))
       AND status = 'accepted'`,
      [userA, userB]
    );
    return res.rows.length > 0;
  } else {
    return memoryFriendships.some(
      f => ((f.requester.toLowerCase() === userA.toLowerCase() && f.recipient.toLowerCase() === userB.toLowerCase()) ||
            (f.requester.toLowerCase() === userB.toLowerCase() && f.recipient.toLowerCase() === userA.toLowerCase())) &&
           f.status === 'accepted'
    );
  }
}

// ================= SOCKET.IO ENGINE =================

io.on('connection', async (socket) => {
  const rawUsername = (socket.handshake.query?.username || '').trim();
  const token = socket.handshake.auth?.token || socket.handshake.query?.token || '';

  if (!rawUsername || !token || !verifyAuthToken(rawUsername, token)) {
    socket.emit('account-deleted');
    socket.disconnect(true);
    return;
  }

  let username = rawUsername;
  if (useDB) {
    try {
      const uCheck = await pool.query('SELECT username FROM users WHERE LOWER(username) = LOWER($1)', [rawUsername]);
      if (uCheck.rows.length === 0) {
        socket.emit('account-deleted');
        socket.disconnect(true);
        return;
      }
      username = uCheck.rows[0].username;
    } catch (e) {
      socket.disconnect(true);
      return;
    }
  } else {
    const uObj = memoryUsers.find(u => u.username.toLowerCase() === rawUsername.toLowerCase());
    if (!uObj) {
      socket.emit('account-deleted');
      socket.disconnect(true);
      return;
    }
    username = uObj.username;
  }

  socket.username = username;
  if (!userSockets.has(username)) {
    userSockets.set(username, new Set());
  }
  userSockets.get(username).add(socket.id);

  await updateLastSeen(username);
  await broadcastSocialUpdates();

  // Send synchronized Game Mode, Doodle, Custom Songs & Personalized Extras on connect
  socket.emit('game-sync-state', {
    ttt: serverGameState.ttt,
    mind: getPublicMindState(username),
    rps: getPublicRpsState(username),
    catchGame: serverGameState.catchGame,
    bomb: serverGameState.bomb,
    likely: getPublicLikelyState(username),
    ytVideoId: serverGameState.ytVideoId,
    doodleStrokes: serverGameState.doodleStrokes,
    gameAudio: getGameAudioMeta()
  });

  socket.emit('app-extras-sync', {
    theme: sharedExtras.theme,
    chaosMode: sharedExtras.chaosMode,
    hands: getHandsState(),
    pet: getComputedPetState(username),
    sticky: sharedExtras.sticky
  });

  // -------- CHAT & SOCIAL EVENTS --------

  socket.on('request-social-data', async () => {
    try {
      const data = await getSocialDataForUser(username);
      socket.emit('social-data', data);
    } catch (err) {
      console.error('request-social-data error:', err);
    }
  });

  socket.on('send-friend-request', async ({ to } = {}) => {
    if (!to || to.toLowerCase() === username.toLowerCase()) return;
    await ensureVIPAutoConnected();
    await broadcastSocialUpdates();
  });

  socket.on('respond-friend-request', async () => {
    await ensureVIPAutoConnected();
    await broadcastSocialUpdates();
  });

  socket.on('load-private-chat', async ({ friend } = {}) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      ensureTTTSymbols(username, friend);

      if (useDB) {
        await pool.query(
          `UPDATE messages SET seen = TRUE
           WHERE LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2) AND seen = FALSE`,
          [friend, username]
        );

        const res = await pool.query(
          `SELECT id, username, recipient, text, reply_to, seen, reaction, msg_type, media_id, media_viewed, created_at
           FROM messages
           WHERE (LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(username) = LOWER($2) AND LOWER(recipient) = LOWER($1))
           ORDER BY id ASC`,
          [username, friend]
        );
        socket.emit('private-chat-history', { friend, messages: res.rows });
      } else {
        memoryMessages.forEach(m => {
          if (m.username.toLowerCase() === friend.toLowerCase() && m.recipient.toLowerCase() === username.toLowerCase()) {
            m.seen = true;
          }
        });
        const msgs = memoryMessages.filter(
          m => (m.username.toLowerCase() === username.toLowerCase() && m.recipient.toLowerCase() === friend.toLowerCase()) ||
               (m.username.toLowerCase() === friend.toLowerCase() && m.recipient.toLowerCase() === username.toLowerCase())
        );
        socket.emit('private-chat-history', { friend, messages: msgs });
      }

      if (isUserOnline(friend)) {
        emitToUser(friend, 'messages-seen', { by: username });
      }
      const updatedSocial = await getSocialDataForUser(username);
      socket.emit('social-data', updatedSocial);
      socket.emit('ttt-state', serverGameState.ttt);
    } catch (err) {
      console.error('Load private chat error:', err);
    }
  });

  socket.on('private-message', async ({ to, text, replyTo, isSecret } = {}) => {
    const cleanText = (text || '').trim().slice(0, 2000);
    if (!to || !cleanText) return;

    try {
      const allowed = await areFriends(username, to);
      if (!allowed) return;

      const safeReply = replyTo && replyTo.text
        ? { id: replyTo.id, username: String(replyTo.username || ''), text: String(replyTo.text).slice(0, 120) }
        : null;
      const msgType = isSecret ? 'secret' : 'text';

      let savedMsg = null;
      if (useDB) {
        const res = await pool.query(
          `INSERT INTO messages (username, recipient, text, reply_to, seen, reaction, msg_type, media_id, media_viewed)
           VALUES ($1, $2, $3, $4, FALSE, NULL, $5, NULL, FALSE)
           RETURNING id, username, recipient, text, reply_to, seen, reaction, msg_type, media_id, media_viewed, created_at`,
          [username, to, cleanText, safeReply ? JSON.stringify(safeReply) : null, msgType]
        );
        savedMsg = res.rows[0];
      } else {
        savedMsg = {
          id: msgIdCounter++,
          username,
          recipient: to,
          text: cleanText,
          reply_to: safeReply,
          seen: false,
          reaction: null,
          msg_type: msgType,
          media_id: null,
          media_viewed: false,
          created_at: new Date().toISOString()
        };
        memoryMessages.push(savedMsg);
      }

      emitToUser(username, 'private-message', savedMsg);

      if (isUserOnline(to)) {
        emitToUser(to, 'private-message', savedMsg);
        const recipientSocial = await getSocialDataForUser(to);
        emitToUser(to, 'social-data', recipientSocial);
      }

      sendPushNotification(to, {
        title: username,
        body: isSecret ? '💌 Sent a secret scratch message!' : cleanText,
        tag: `chat-${username}`
      });
    } catch (err) {
      console.error('Send private message error:', err);
    }
  });

  socket.on('heart-shower', async ({ to } = {}) => {
    if (!to || !(await areFriends(username, to))) return;
    emitToUser(username, 'heart-shower', { from: username });
    if (isUserOnline(to)) {
      emitToUser(to, 'heart-shower', { from: username });
    }
  });

  // -------- LIVE CHAOS TYPING MODE --------

  socket.on('chaos-toggle', async ({ to, enabled } = {}) => {
    if (!to || !(await areFriends(username, to))) return;
    sharedExtras.chaosMode = Boolean(enabled);
    const payload = { enabled: sharedExtras.chaosMode, by: username };
    emitToUser(username, 'chaos-state', payload);
    if (isUserOnline(to)) emitToUser(to, 'chaos-state', payload);
  });

  socket.on('chaos-draft', async ({ to, text } = {}) => {
    if (!to || !sharedExtras.chaosMode) return;
    if (isUserOnline(to)) {
      emitToUser(to, 'chaos-draft', { from: username, text: String(text || '').slice(0, 300) });
    }
  });

  // -------- HOLD HANDS LIVE HEARTBEAT SYNC --------

  socket.on('hold-hands', async ({ to, holding } = {}) => {
    if (!to || !(await areFriends(username, to))) return;
    const me = username.toLowerCase();
    sharedExtras.handsHolding[me] = Boolean(holding);
    const state = getHandsState();
    emitToUser(username, 'hold-hands-state', state);
    if (isUserOnline(to)) emitToUser(to, 'hold-hands-state', state);
  });

  // -------- LIVE SYNCED CHAT THEMES --------

  socket.on('set-theme', async ({ to, theme } = {}) => {
    if (!to || !ALLOWED_THEMES.includes(theme)) return;
    if (!(await areFriends(username, to))) return;
    sharedExtras.theme = theme;
    await persistAppConfig('chat_theme', { theme });
    const payload = { theme, by: username };
    emitToUser(username, 'theme-sync', payload);
    if (isUserOnline(to)) emitToUser(to, 'theme-sync', payload);
  });

  // -------- VIRTUAL COUPLE PET (INDEPENDENT NAMES PER USER) --------

  socket.on('pet-action', async ({ to, action, name } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      const me = username.toLowerCase();
      const cur = getComputedPetState(username);
      const p = sharedExtras.pet;
      if (!p.names || typeof p.names !== 'object') p.names = {};

      p.hunger = cur.hunger;
      p.happiness = cur.happiness;

      const todayKey = new Date().toISOString().slice(0, 10);
      let myNote = '';
      let partnerNote = '';

      if (action === 'feed') {
        p.hunger = Math.min(100, p.hunger + 22);
        p.happiness = Math.min(100, p.happiness + 8);
        p.xp += 20;
        if (p.lastFedDate !== todayKey) {
          p.streak = (p.streak || 0) + 1;
          p.lastFedDate = todayKey;
        }
        myNote = `Fed ${getComputedPetState(username).name} 🐟`;
        partnerNote = `${username} fed ${getComputedPetState(to).name} 🐟`;
      } else if (action === 'play') {
        p.happiness = Math.min(100, p.happiness + 24);
        p.hunger = Math.max(10, p.hunger - 5);
        p.xp += 25;
        myNote = `Played with ${getComputedPetState(username).name} 🧶`;
        partnerNote = `${username} played with ${getComputedPetState(to).name} 🧶`;
      } else if (action === 'pet') {
        p.happiness = Math.min(100, p.happiness + 16);
        p.xp += 12;
        myNote = `Cuddled ${getComputedPetState(username).name} 💖`;
        partnerNote = `${username} cuddled ${getComputedPetState(to).name} 💖`;
      } else if (action === 'rename' && name && String(name).trim()) {
        // Only update THIS user's pet name; partner's pet name stays independent
        const cleanPetName = String(name).trim().slice(0, 26);
        p.names[me] = cleanPetName;
        myNote = `Your pet is now named "${cleanPetName}" 🐾`;
        partnerNote = `${username} named their pet "${cleanPetName}" 🐾`;
      } else {
        return;
      }

      // Level up every 100 XP
      let leveledUp = false;
      while (p.xp >= 100) {
        p.xp -= 100;
        p.level += 1;
        leveledUp = true;
      }
      if (leveledUp) {
        myNote = `🎉 ${getComputedPetState(username).name} reached Level ${p.level}!`;
        partnerNote = `🎉 ${getComputedPetState(to).name} reached Level ${p.level}!`;
      }

      p.lastInteraction = Date.now();
      await persistAppConfig('couple_pet', p);

      emitToUser(username, 'pet-state', { pet: getComputedPetState(username), note: myNote, action });
      if (isUserOnline(to)) {
        emitToUser(to, 'pet-state', { pet: getComputedPetState(to), note: partnerNote, action });
      }
    } catch (err) {
      console.error('pet-action error:', err);
    }
  });

  // -------- SHARED STICKY NOTE & COUNTDOWN --------

  socket.on('sticky-update', async ({ to, note, countdownTitle, countdownDate } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      sharedExtras.sticky = {
        note: String(note || '').trim().slice(0, 180),
        updatedBy: username,
        countdownTitle: String(countdownTitle || '').trim().slice(0, 50),
        countdownDate: String(countdownDate || '').trim().slice(0, 30)
      };
      await persistAppConfig('sticky_note', sharedExtras.sticky);

      emitToUser(username, 'sticky-state', sharedExtras.sticky);
      if (isUserOnline(to)) emitToUser(to, 'sticky-state', sharedExtras.sticky);
    } catch (err) {
      console.error('sticky-update error:', err);
    }
  });

  // -------- 1. UPGRADED TIC-TAC-TOE --------

  socket.on('ttt-set-symbol', async ({ to, symbol } = {}) => {
    try {
      if (!to || !ALLOWED_TTT_EMOJIS.includes(symbol)) return;
      if (!(await areFriends(username, to))) return;

      ensureTTTSymbols(username, to);
      const me = username.toLowerCase();
      const partner = to.toLowerCase();

      if (serverGameState.ttt.symbols[partner] === symbol) {
        socket.emit('game-toast', { message: `${to} is already using ${symbol}! Pick another.`, type: 'error' });
        return;
      }

      const oldSymbol = serverGameState.ttt.symbols[me];
      serverGameState.ttt.symbols[me] = symbol;
      serverGameState.ttt.board = serverGameState.ttt.board.map(c => (c === oldSymbol ? symbol : c));
      if (serverGameState.ttt.winnerSymbol === oldSymbol) {
        serverGameState.ttt.winnerSymbol = symbol;
      }

      emitToUser(username, 'ttt-state', serverGameState.ttt);
      if (isUserOnline(to)) emitToUser(to, 'ttt-state', serverGameState.ttt);
    } catch (err) {
      console.error('ttt-set-symbol error:', err);
    }
  });

  socket.on('ttt-move', async ({ to, index } = {}) => {
    try {
      if (!to || typeof index !== 'number' || index < 0 || index > 8) return;
      if (!(await areFriends(username, to))) return;

      ensureTTTSymbols(username, to);
      const ttt = serverGameState.ttt;
      const me = username.toLowerCase();
      const partner = to.toLowerCase();

      if (ttt.winnerUser || ttt.isDraw || ttt.board[index]) return;
      if (ttt.turnUser !== me) return;

      const mySymbol = ttt.symbols[me];
      ttt.board[index] = mySymbol;

      const winSym = checkTTTWinner(ttt.board);
      const draw = !winSym && ttt.board.every(Boolean);

      if (winSym) {
        ttt.winnerUser = me;
        ttt.winnerSymbol = winSym;
        ttt.scores[me] = (ttt.scores[me] || 0) + 1;
        ttt.lastDare = TTT_WINNER_DARES[Math.floor(Math.random() * TTT_WINNER_DARES.length)];
      } else if (draw) {
        ttt.isDraw = true;
        ttt.lastDare = null;
      } else {
        ttt.turnUser = partner;
      }

      emitToUser(username, 'ttt-state', ttt);
      if (isUserOnline(to)) emitToUser(to, 'ttt-state', ttt);
    } catch (err) {
      console.error('ttt-move error:', err);
    }
  });

  socket.on('ttt-reset', async ({ to, resetScores } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      ensureTTTSymbols(username, to);
      const me = username.toLowerCase();
      const partner = to.toLowerCase();

      serverGameState.ttt.board = Array(9).fill(null);
      serverGameState.ttt.winnerUser = null;
      serverGameState.ttt.winnerSymbol = null;
      serverGameState.ttt.isDraw = false;
      serverGameState.ttt.lastDare = null;
      serverGameState.ttt.turnUser = serverGameState.ttt.turnUser === me ? partner : me;

      if (resetScores) {
        serverGameState.ttt.scores = {};
      }

      emitToUser(username, 'ttt-state', serverGameState.ttt);
      if (isUserOnline(to)) emitToUser(to, 'ttt-state', serverGameState.ttt);
    } catch (err) {
      console.error('ttt-reset error:', err);
    }
  });

  // -------- 2. MIND SYNC (TELEPATHY TEST) --------

  socket.on('mind-submit', async ({ to, text } = {}) => {
    try {
      const clean = String(text || '').trim().slice(0, 60);
      if (!to || !clean) return;
      if (!(await areFriends(username, to))) return;

      const m = serverGameState.mind;
      if (m.revealed) return;

      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      m.answers[me] = { name: username, text: clean };

      if (m.answers[me] && m.answers[partner]) {
        m.revealed = true;
        const a1 = m.answers[me].text.toLowerCase().replace(/[^a-z0-9]/g, '');
        const a2 = m.answers[partner].text.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatch = Boolean(a1 && a2 && (a1 === a2 || a1.includes(a2) || a2.includes(a1)));
        m.matched = isMatch;
        m.streak = isMatch ? m.streak + 1 : 0;
      }

      emitToUser(username, 'mind-state', getPublicMindState(username));
      if (isUserOnline(to)) emitToUser(to, 'mind-state', getPublicMindState(to));
    } catch (err) {
      console.error('mind-submit error:', err);
    }
  });

  socket.on('mind-next', async ({ to, promptIndex, customPrompt } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      const m = serverGameState.mind;
      m.answers = {};
      m.revealed = false;
      m.matched = false;
      if (customPrompt && String(customPrompt).trim()) {
        m.customPrompt = String(customPrompt).trim().slice(0, 90);
      } else {
        m.customPrompt = null;
        m.promptIndex = typeof promptIndex === 'number' ? promptIndex : m.promptIndex + 1;
      }

      emitToUser(username, 'mind-state', getPublicMindState(username));
      if (isUserOnline(to)) emitToUser(to, 'mind-state', getPublicMindState(to));
    } catch (err) {
      console.error('mind-next error:', err);
    }
  });

  // -------- 3. EMOJI ROCK-PAPER-SCISSORS (BEST OF 5) --------

  socket.on('rps-pick', async ({ to, move } = {}) => {
    try {
      if (!to || !['rock', 'paper', 'scissors'].includes(move)) return;
      if (!(await areFriends(username, to))) return;

      const r = serverGameState.rps;
      if (r.matchWinner) return;

      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      r.picks[me] = move;

      if (r.picks[me] && r.picks[partner]) {
        const m1 = r.picks[me];
        const m2 = r.picks[partner];
        let roundWinner = null;
        let resultText = "It's a tie!";

        if (m1 !== m2) {
          const meWins =
            (m1 === 'rock' && m2 === 'scissors') ||
            (m1 === 'paper' && m2 === 'rock') ||
            (m1 === 'scissors' && m2 === 'paper');
          roundWinner = meWins ? me : partner;
          r.scores[roundWinner] = (r.scores[roundWinner] || 0) + 1;
          resultText = `${meWins ? username : to} won Round ${r.round}!`;
          if (r.scores[roundWinner] >= 3) {
            r.matchWinner = roundWinner;
            resultText = `${meWins ? username : to} won the Best-of-5 match!`;
          }
        }

        r.lastResult = {
          picks: { [me]: m1, [partner]: m2 },
          winnerUser: roundWinner,
          text: resultText
        };
        r.picks = {};
        r.round += 1;
      }

      emitToUser(username, 'rps-state', getPublicRpsState(username));
      if (isUserOnline(to)) emitToUser(to, 'rps-state', getPublicRpsState(to));
    } catch (err) {
      console.error('rps-pick error:', err);
    }
  });

  socket.on('rps-reset', async ({ to } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      serverGameState.rps = {
        round: 1,
        picks: {},
        scores: {},
        lastResult: null,
        matchWinner: null
      };
      emitToUser(username, 'rps-state', getPublicRpsState(username));
      if (isUserOnline(to)) emitToUser(to, 'rps-state', getPublicRpsState(to));
    } catch (err) {
      console.error('rps-reset error:', err);
    }
  });

  // -------- 4. 30-SECOND HEART CATCH BATTLE --------

  socket.on('catch-start', async ({ to } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      if (catchTimerHandle) clearTimeout(catchTimerHandle);

      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      serverGameState.catchGame = {
        active: true,
        endTime: Date.now() + 30000,
        scores: { [me]: 0, [partner]: 0 },
        winnerUser: null
      };

      emitToUser(username, 'catch-state', serverGameState.catchGame);
      if (isUserOnline(to)) emitToUser(to, 'catch-state', serverGameState.catchGame);

      catchTimerHandle = setTimeout(() => {
        const cg = serverGameState.catchGame;
        cg.active = false;
        const s1 = cg.scores[me] || 0;
        const s2 = cg.scores[partner] || 0;
        cg.winnerUser = s1 === s2 ? 'draw' : (s1 > s2 ? me : partner);
        emitToUser(username, 'catch-state', cg);
        if (isUserOnline(to)) emitToUser(to, 'catch-state', cg);
        catchTimerHandle = null;
      }, 30500);
    } catch (err) {
      console.error('catch-start error:', err);
    }
  });

  socket.on('catch-score', async ({ to, delta } = {}) => {
    try {
      if (!to || ![1, 2, -1].includes(delta)) return;
      if (!(await areFriends(username, to))) return;
      const cg = serverGameState.catchGame;
      if (!cg.active || Date.now() > cg.endTime + 500) return;

      const me = username.toLowerCase();
      cg.scores[me] = Math.max(0, (cg.scores[me] || 0) + delta);

      emitToUser(username, 'catch-state', cg);
      if (isUserOnline(to)) emitToUser(to, 'catch-state', cg);
    } catch (err) {
      console.error('catch-score error:', err);
    }
  });

  // -------- 5. HOT POTATO / BOMB PASS --------

  socket.on('bomb-start', async ({ to } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      if (bombTimerHandle) clearTimeout(bombTimerHandle);

      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      const startWithMe = Math.random() < 0.5;
      const durationMs = 8000 + Math.floor(Math.random() * 8000);

      serverGameState.bomb = {
        active: true,
        holder: startWithMe ? me : partner,
        holderName: startWithMe ? username : to,
        tapsDone: 0,
        tapsNeeded: 5,
        passes: 0,
        explodedOn: null,
        explodedName: null,
        dare: null,
        roundId: Date.now()
      };

      emitToUser(username, 'bomb-state', serverGameState.bomb);
      if (isUserOnline(to)) emitToUser(to, 'bomb-state', serverGameState.bomb);

      bombTimerHandle = setTimeout(() => {
        const b = serverGameState.bomb;
        b.active = false;
        b.explodedOn = b.holder;
        b.explodedName = b.holderName;
        b.dare = BOMB_EXPLODE_DARES[Math.floor(Math.random() * BOMB_EXPLODE_DARES.length)];
        emitToUser(username, 'bomb-state', b);
        if (isUserOnline(to)) emitToUser(to, 'bomb-state', b);
        bombTimerHandle = null;
      }, durationMs);
    } catch (err) {
      console.error('bomb-start error:', err);
    }
  });

  socket.on('bomb-tap', async ({ to } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      const b = serverGameState.bomb;
      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      if (!b.active || b.holder !== me) return;

      b.tapsDone += 1;
      if (b.tapsDone >= b.tapsNeeded) {
        b.holder = partner;
        b.holderName = to;
        b.tapsDone = 0;
        b.tapsNeeded = 4 + Math.floor(Math.random() * 4);
        b.passes += 1;
      }

      emitToUser(username, 'bomb-state', b);
      if (isUserOnline(to)) emitToUser(to, 'bomb-state', b);
    } catch (err) {
      console.error('bomb-tap error:', err);
    }
  });

  // -------- 6. WHO'S MORE LIKELY TO? QUIZ --------

  socket.on('likely-pick', async ({ to, pickUser } = {}) => {
    try {
      const cleanPick = String(pickUser || '').trim().slice(0, 50);
      if (!to || !cleanPick) return;
      if (!(await areFriends(username, to))) return;

      const l = serverGameState.likely;
      if (l.revealed) return;

      const me = username.toLowerCase();
      const partner = to.toLowerCase();
      l.picks[me] = { name: username, picked: cleanPick };

      if (l.picks[me] && l.picks[partner]) {
        l.revealed = true;
        l.totalRounds += 1;
        const isMatch = l.picks[me].picked.toLowerCase() === l.picks[partner].picked.toLowerCase();
        l.matched = isMatch;
        if (isMatch) l.matchCount += 1;
      }

      emitToUser(username, 'likely-state', getPublicLikelyState(username));
      if (isUserOnline(to)) emitToUser(to, 'likely-state', getPublicLikelyState(to));
    } catch (err) {
      console.error('likely-pick error:', err);
    }
  });

  socket.on('likely-next', async ({ to, questionIndex, customQuestion } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      const l = serverGameState.likely;
      l.picks = {};
      l.revealed = false;
      l.matched = false;
      if (customQuestion && String(customQuestion).trim()) {
        l.customQuestion = String(customQuestion).trim().slice(0, 90);
      } else {
        l.customQuestion = null;
        l.questionIndex = typeof questionIndex === 'number' ? questionIndex : l.questionIndex + 1;
      }

      emitToUser(username, 'likely-state', getPublicLikelyState(username));
      if (isUserOnline(to)) emitToUser(to, 'likely-state', getPublicLikelyState(to));
    } catch (err) {
      console.error('likely-next error:', err);
    }
  });

  // -------- 7. WATCH TOGETHER + LIVE REACTIONS --------

  socket.on('yt-sync', async ({ to, videoId, action, timeSec } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(String(videoId))) {
        serverGameState.ytVideoId = String(videoId);
      }
      const payload = {
        from: username,
        videoId: serverGameState.ytVideoId,
        action: action || 'load',
        timeSec: typeof timeSec === 'number' ? timeSec : 0
      };
      emitToUser(username, 'yt-sync', payload);
      if (isUserOnline(to)) emitToUser(to, 'yt-sync', payload);
    } catch (err) {
      console.error('yt-sync error:', err);
    }
  });

  socket.on('watch-reaction', async ({ to, emoji } = {}) => {
    try {
      if (!to || !ALLOWED_REACTIONS.includes(emoji)) return;
      if (!(await areFriends(username, to))) return;
      const payload = { from: username, emoji };
      emitToUser(username, 'watch-reaction', payload);
      if (isUserOnline(to)) emitToUser(to, 'watch-reaction', payload);
    } catch (err) {
      console.error('watch-reaction error:', err);
    }
  });

  // -------- 8. SHARED LIVE DOODLE CANVAS --------

  socket.on('doodle-draw', async ({ to, segment } = {}) => {
    try {
      if (!to || !segment || typeof segment.x0 !== 'number' || typeof segment.y0 !== 'number') return;
      if (!(await areFriends(username, to))) return;

      const safeSeg = {
        x0: Math.max(0, Math.min(1, segment.x0)),
        y0: Math.max(0, Math.min(1, segment.y0)),
        x1: Math.max(0, Math.min(1, segment.x1)),
        y1: Math.max(0, Math.min(1, segment.y1)),
        color: String(segment.color || '#38bdf8').slice(0, 20),
        size: Math.max(1, Math.min(20, Number(segment.size) || 4))
      };

      serverGameState.doodleStrokes.push(safeSeg);
      if (serverGameState.doodleStrokes.length > 2500) {
        serverGameState.doodleStrokes.splice(0, 500);
      }

      if (isUserOnline(to)) {
        emitToUser(to, 'doodle-draw', safeSeg);
      }
    } catch (err) {
      console.error('doodle-draw error:', err);
    }
  });

  socket.on('doodle-clear', async ({ to } = {}) => {
    try {
      if (!to || !(await areFriends(username, to))) return;
      serverGameState.doodleStrokes = [];
      emitToUser(username, 'doodle-clear', { from: username });
      if (isUserOnline(to)) emitToUser(to, 'doodle-clear', { from: username });
    } catch (err) {
      console.error('doodle-clear error:', err);
    }
  });

  // -------- READ RECEIPTS, TYPING, REACTIONS & MESSAGE OPS --------

  socket.on('mark-seen', async ({ friend } = {}) => {
    if (!friend) return;
    try {
      if (useDB) {
        await pool.query(
          `UPDATE messages SET seen = TRUE
           WHERE LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2) AND seen = FALSE`,
          [friend, username]
        );
      } else {
        memoryMessages.forEach(m => {
          if (m.username.toLowerCase() === friend.toLowerCase() && m.recipient.toLowerCase() === username.toLowerCase()) {
            m.seen = true;
          }
        });
      }
      if (isUserOnline(friend)) {
        emitToUser(friend, 'messages-seen', { by: username });
      }
      const updatedSocial = await getSocialDataForUser(username);
      socket.emit('social-data', updatedSocial);
    } catch (err) {
      console.error('Mark seen error:', err);
    }
  });

  socket.on('typing', ({ to } = {}) => {
    if (to && isUserOnline(to)) emitToUser(to, 'typing', { from: username });
  });

  socket.on('stop-typing', ({ to } = {}) => {
    if (to && isUserOnline(to)) emitToUser(to, 'stop-typing', { from: username });
  });

  socket.on('react-message', async ({ id, friend } = {}) => {
    if (!id) return;
    try {
      if (useDB) {
        const cur = await pool.query(
          `SELECT reaction FROM messages
           WHERE id = $1 AND (LOWER(username) = LOWER($2) OR LOWER(recipient) = LOWER($2))`,
          [id, username]
        );
        if (cur.rows.length === 0) return;
        const nextReaction = cur.rows[0].reaction ? null : '❤️';
        await pool.query('UPDATE messages SET reaction = $1 WHERE id = $2', [nextReaction, id]);
        emitToUser(username, 'message-reacted', { id, reaction: nextReaction });
        if (friend && isUserOnline(friend)) emitToUser(friend, 'message-reacted', { id, reaction: nextReaction });
      } else {
        const msg = memoryMessages.find(
          m => String(m.id) === String(id) &&
               (m.username.toLowerCase() === username.toLowerCase() || m.recipient.toLowerCase() === username.toLowerCase())
        );
        if (!msg) return;
        msg.reaction = msg.reaction ? null : '❤️';
        emitToUser(username, 'message-reacted', { id, reaction: msg.reaction });
        if (friend && isUserOnline(friend)) emitToUser(friend, 'message-reacted', { id, reaction: msg.reaction });
      }
    } catch (err) {
      console.error('React message error:', err);
    }
  });

  socket.on('delete-message', async ({ id, friend } = {}) => {
    if (!id) return;
    try {
      if (useDB) {
        const res = await pool.query(
          'DELETE FROM messages WHERE id = $1 AND LOWER(username) = LOWER($2) RETURNING id, media_id',
          [id, username]
        );
        if (res.rows.length > 0) {
          if (res.rows[0].media_id) {
            await pool.query('DELETE FROM chat_media WHERE id = $1', [res.rows[0].media_id]);
          }
          emitToUser(username, 'message-deleted', id);
          if (friend && isUserOnline(friend)) emitToUser(friend, 'message-deleted', id);
        }
      } else {
        const idx = memoryMessages.findIndex(
          m => String(m.id) === String(id) && m.username.toLowerCase() === username.toLowerCase()
        );
        if (idx !== -1) {
          const removed = memoryMessages.splice(idx, 1)[0];
          if (removed.media_id) memoryMedia.delete(removed.media_id);
          emitToUser(username, 'message-deleted', id);
          if (friend && isUserOnline(friend)) emitToUser(friend, 'message-deleted', id);
        }
      }
    } catch (err) {
      console.error('Delete message error:', err);
    }
  });

  socket.on('clear-chat', async ({ friend } = {}) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      if (useDB) {
        await pool.query(
          `DELETE FROM chat_media
           WHERE (LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(username) = LOWER($2) AND LOWER(recipient) = LOWER($1))`,
          [username, friend]
        );
        await pool.query(
          `DELETE FROM messages
           WHERE (LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(username) = LOWER($2) AND LOWER(recipient) = LOWER($1))`,
          [username, friend]
        );
      } else {
        for (let i = memoryMessages.length - 1; i >= 0; i--) {
          const m = memoryMessages[i];
          if (
            (m.username.toLowerCase() === username.toLowerCase() && m.recipient.toLowerCase() === friend.toLowerCase()) ||
            (m.username.toLowerCase() === friend.toLowerCase() && m.recipient.toLowerCase() === username.toLowerCase())
          ) {
            if (m.media_id) memoryMedia.delete(m.media_id);
            memoryMessages.splice(i, 1);
          }
        }
      }
      emitToUser(username, 'chat-cleared', { friend });
      if (isUserOnline(friend)) emitToUser(friend, 'chat-cleared', { friend: username });
    } catch (err) {
      console.error('Clear chat error:', err);
    }
  });

  // -------- WEBRTC SIGNALING --------

  socket.on('call-user', async ({ to, offer, isVideo } = {}) => {
    try {
      if (!to || !offer) return;
      const allowed = await areFriends(username, to);
      if (!allowed) return;

      sendPushNotification(to, {
        title: `Incoming ${isVideo ? 'Video' : 'Voice'} Call`,
        body: `${username} is calling you`,
        tag: 'incoming-call'
      });

      if (!isUserOnline(to)) {
        socket.emit('call-error', { message: `${to} is currently offline.` });
        return;
      }
      emitToUser(to, 'incoming-call', { from: username, offer, isVideo: Boolean(isVideo) });
    } catch (err) {
      console.error('call-user error:', err);
    }
  });

  socket.on('make-answer', ({ to, answer } = {}) => {
    if (to && answer) emitToUser(to, 'call-answered', { from: username, answer });
  });

  socket.on('ice-candidate', ({ to, candidate } = {}) => {
    if (to && candidate) emitToUser(to, 'ice-candidate', { from: username, candidate });
  });

  socket.on('call-media-state', ({ to, micEnabled, camEnabled } = {}) => {
    if (to) emitToUser(to, 'call-media-state', { from: username, micEnabled, camEnabled });
  });

  socket.on('reject-call', ({ to } = {}) => {
    if (to) emitToUser(to, 'call-rejected', { from: username });
  });

  socket.on('end-call', ({ to } = {}) => {
    if (to) emitToUser(to, 'call-ended', { from: username });
  });

  socket.on('disconnect', async () => {
    const set = userSockets.get(username);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(username);
        const me = username.toLowerCase();
        if (sharedExtras.handsHolding[me]) {
          sharedExtras.handsHolding[me] = false;
          const state = getHandsState();
          for (const uname of userSockets.keys()) {
            emitToUser(uname, 'hold-hands-state', state);
          }
        }
      }
    }
    await updateLastSeen(username);
    await broadcastSocialUpdates();
  });
});

const PORT = process.env.PORT || 3000;
initDB().finally(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});