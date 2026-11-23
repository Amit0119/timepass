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

// Security Headers & Payload Protection
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

// Local Memory Fallback Stores
const memoryUsers = [];
const memoryFriendships = [];
const memoryMessages = [];
const memorySubscriptions = new Map();
let msgIdCounter = 1;

const MASTER_RECOVERY_PIN = process.env.MASTER_RECOVERY_PIN || '0119';
const LOCAL_VAPID_FILE = path.join(__dirname, '.vapid.json');
let vapidKeys = null;
let tokenSecret = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  const now = Date.now();
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

async function initDB() {
  if (!useDB) {
    vapidKeys = loadOrCreateLocalVapidKeys();
    tokenSecret = crypto.createHash('sha256').update(vapidKeys.privateKey).digest('hex');
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

    tokenSecret = process.env.TOKEN_SECRET || crypto.createHash('sha256').update(vapidKeys.privateKey).digest('hex');

    webpush.setVapidDetails(
      'mailto:admin@miniworld.app',
      process.env.VAPID_PUBLIC_KEY || vapidKeys.publicKey,
      process.env.VAPID_PRIVATE_KEY || vapidKeys.privateKey
    );

    console.log('Database, Security, and Web-Push initialized.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}
initDB();

// ================= WEB PUSH ROUTES =================

app.get('/vapid-public-key', (req, res) => {
  if (!vapidKeys) return res.status(503).json({ error: 'Push service initializing' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || vapidKeys.publicKey });
});

app.post('/subscribe', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const subscription = req.body.subscription;
    if (!username || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
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
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });

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
    const username = (req.body.username || '').trim().replace(/[<>]/g, '');
    const password = req.body.password || '';
    const recoveryCode = (req.body.recoveryCode || MASTER_RECOVERY_PIN).trim() || MASTER_RECOVERY_PIN;

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
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

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
    const username = (req.body.username || '').trim();
    const oldPassword = req.body.oldPassword || '';
    const newPassword = req.body.newPassword || '';
    const newRecoveryCode = (req.body.newRecoveryCode || '').trim();

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
    const username = (req.body.username || '').trim();
    const recoveryCode = (req.body.recoveryCode || '').trim();
    const newPassword = req.body.newPassword || '';

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
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const recoveryCode = (req.body.recoveryCode || req.body.confirmation || '').trim();

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
      await pool.query('DELETE FROM messages WHERE LOWER(username) = LOWER($1) OR LOWER(recipient) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM friendships WHERE LOWER(requester) = LOWER($1) OR LOWER(recipient) = LOWER($1)', [exactUsername]);
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
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
  const rawUsername = (socket.handshake.query.username || '').trim();
  const token = socket.handshake.auth?.token || socket.handshake.query?.token || '';

  if (!rawUsername) {
    socket.disconnect();
    return;
  }

  if (token && !verifyAuthToken(rawUsername, token)) {
    socket.emit('account-deleted');
    socket.disconnect();
    return;
  }

  let username = rawUsername;
  if (useDB) {
    try {
      const uCheck = await pool.query('SELECT username FROM users WHERE LOWER(username) = LOWER($1)', [rawUsername]);
      if (uCheck.rows.length === 0) {
        socket.emit('account-deleted');
        socket.disconnect();
        return;
      }
      username = uCheck.rows[0].username;
    } catch (e) {}
  }

  socket.username = username;
  if (!userSockets.has(username)) {
    userSockets.set(username, new Set());
  }
  userSockets.get(username).add(socket.id);

  await updateLastSeen(username);
  await broadcastSocialUpdates();

  socket.on('request-social-data', async () => {
    const data = await getSocialDataForUser(username);
    socket.emit('social-data', data);
  });

  socket.on('send-friend-request', async ({ to }) => {
    if (!to || to.toLowerCase() === username.toLowerCase()) return;
    await ensureVIPAutoConnected();
    await broadcastSocialUpdates();
  });

  socket.on('respond-friend-request', async () => {
    await ensureVIPAutoConnected();
    await broadcastSocialUpdates();
  });

  socket.on('load-private-chat', async ({ friend }) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      if (useDB) {
        await pool.query(
          `UPDATE messages SET seen = TRUE
           WHERE LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2) AND seen = FALSE`,
          [friend, username]
        );

        const res = await pool.query(
          `SELECT id, username, recipient, text, reply_to, seen, reaction, created_at
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
    } catch (err) {
      console.error('Load private chat error:', err);
    }
  });

  socket.on('private-message', async ({ to, text, replyTo }) => {
    const cleanText = (text || '').trim().slice(0, 2000);
    if (!to || !cleanText) return;

    try {
      const allowed = await areFriends(username, to);
      if (!allowed) return;

      const safeReply = replyTo && replyTo.text
        ? { id: replyTo.id, username: String(replyTo.username || ''), text: String(replyTo.text).slice(0, 120) }
        : null;

      let savedMsg = null;
      if (useDB) {
        const res = await pool.query(
          `INSERT INTO messages (username, recipient, text, reply_to, seen, reaction)
           VALUES ($1, $2, $3, $4, FALSE, NULL)
           RETURNING id, username, recipient, text, reply_to, seen, reaction, created_at`,
          [username, to, cleanText, safeReply ? JSON.stringify(safeReply) : null]
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
        body: cleanText,
        tag: `chat-${username}`
      });
    } catch (err) {
      console.error('Send private message error:', err);
    }
  });

  socket.on('heart-shower', ({ to }) => {
    emitToUser(username, 'heart-shower', { from: username });
    if (to && isUserOnline(to)) {
      emitToUser(to, 'heart-shower', { from: username });
    }
  });

  // ================= GAME MODE & WATCH TOGETHER SYNC =================

  socket.on('ttt-move', async ({ to, board, turn, winner, isDraw }) => {
    if (!to || !Array.isArray(board)) return;
    if (!(await areFriends(username, to))) return;
    const payload = { from: username, board, turn, winner, isDraw };
    emitToUser(username, 'ttt-state', payload);
    if (isUserOnline(to)) emitToUser(to, 'ttt-state', payload);
  });

  socket.on('ttt-reset', async ({ to }) => {
    if (!to) return;
    if (!(await areFriends(username, to))) return;
    const payload = { from: username };
    emitToUser(username, 'ttt-reset', payload);
    if (isUserOnline(to)) emitToUser(to, 'ttt-reset', payload);
  });

  socket.on('wyr-pick', async ({ to, roundIndex, choice }) => {
    if (!to || !choice) return;
    if (!(await areFriends(username, to))) return;
    const payload = { picker: username, roundIndex, choice };
    emitToUser(username, 'wyr-update', payload);
    if (isUserOnline(to)) emitToUser(to, 'wyr-update', payload);
  });

  socket.on('wyr-next', async ({ to, roundIndex }) => {
    if (!to) return;
    if (!(await areFriends(username, to))) return;
    const payload = { roundIndex };
    emitToUser(username, 'wyr-next', payload);
    if (isUserOnline(to)) emitToUser(to, 'wyr-next', payload);
  });

  socket.on('yt-sync', async ({ to, videoId, action, timeSec }) => {
    if (!to) return;
    if (!(await areFriends(username, to))) return;
    const payload = {
      from: username,
      videoId: videoId || null,
      action: action || 'load',
      timeSec: typeof timeSec === 'number' ? timeSec : 0
    };
    emitToUser(username, 'yt-sync', payload);
    if (isUserOnline(to)) emitToUser(to, 'yt-sync', payload);
  });

  socket.on('mark-seen', async ({ friend }) => {
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

  socket.on('typing', ({ to }) => {
    if (to && isUserOnline(to)) emitToUser(to, 'typing', { from: username });
  });

  socket.on('stop-typing', ({ to }) => {
    if (to && isUserOnline(to)) emitToUser(to, 'stop-typing', { from: username });
  });

  socket.on('react-message', async ({ id, friend }) => {
    if (!id) return;
    try {
      if (useDB) {
        const cur = await pool.query('SELECT reaction FROM messages WHERE id = $1', [id]);
        if (cur.rows.length === 0) return;
        const nextReaction = cur.rows[0].reaction ? null : '❤️';
        await pool.query('UPDATE messages SET reaction = $1 WHERE id = $2', [nextReaction, id]);
        emitToUser(username, 'message-reacted', { id, reaction: nextReaction });
        if (friend && isUserOnline(friend)) emitToUser(friend, 'message-reacted', { id, reaction: nextReaction });
      } else {
        const msg = memoryMessages.find(m => String(m.id) === String(id));
        if (!msg) return;
        msg.reaction = msg.reaction ? null : '❤️';
        emitToUser(username, 'message-reacted', { id, reaction: msg.reaction });
        if (friend && isUserOnline(friend)) emitToUser(friend, 'message-reacted', { id, reaction: msg.reaction });
      }
    } catch (err) {
      console.error('React message error:', err);
    }
  });

  socket.on('delete-message', async ({ id, friend }) => {
    if (!id) return;
    try {
      if (useDB) {
        const res = await pool.query(
          'DELETE FROM messages WHERE id = $1 AND LOWER(username) = LOWER($2) RETURNING id',
          [id, username]
        );
        if (res.rows.length > 0) {
          emitToUser(username, 'message-deleted', id);
          if (friend) emitToUser(friend, 'message-deleted', id);
        }
      } else {
        const idx = memoryMessages.findIndex(
          m => String(m.id) === String(id) && m.username.toLowerCase() === username.toLowerCase()
        );
        if (idx !== -1) {
          memoryMessages.splice(idx, 1);
          emitToUser(username, 'message-deleted', id);
          if (friend) emitToUser(friend, 'message-deleted', id);
        }
      }
    } catch (err) {
      console.error('Delete message error:', err);
    }
  });

  socket.on('clear-chat', async ({ friend }) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      if (useDB) {
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

  // WebRTC Signaling
  socket.on('call-user', async ({ to, offer, isVideo }) => {
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
  });

  socket.on('make-answer', ({ to, answer }) => {
    if (to && answer) emitToUser(to, 'call-answered', { from: username, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (to && candidate) emitToUser(to, 'ice-candidate', { from: username, candidate });
  });

  socket.on('call-media-state', ({ to, micEnabled, camEnabled }) => {
    if (to) emitToUser(to, 'call-media-state', { from: username, micEnabled, camEnabled });
  });

  socket.on('reject-call', ({ to }) => {
    if (to) emitToUser(to, 'call-rejected', { from: username });
  });

  socket.on('end-call', ({ to }) => {
    if (to) emitToUser(to, 'call-ended', { from: username });
  });

  socket.on('disconnect', async () => {
    const set = userSockets.get(username);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(username);
      }
    }
    await updateLastSeen(username);
    await broadcastSocialUpdates();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});