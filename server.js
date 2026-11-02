const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup (PostgreSQL + Local Memory Fallback)
const useDB = Boolean(process.env.DATABASE_URL);
let pool = null;

if (useDB) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}

// Local Fallback Memory Stores
const memoryUsers = []; // { id, username, password, recovery_code }
const memoryFriendships = []; // { id, requester, recipient, status }
const memoryMessages = []; // { id, username, recipient, text, seen, reaction, created_at }
let msgIdCounter = 1;

const MASTER_RECOVERY_PIN = '0119';

async function initDB() {
  if (!useDB) {
    console.log('Running with in-memory database (Local Mode)');
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        recovery_code VARCHAR(50) DEFAULT '0119'
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
        seen BOOLEAN DEFAULT FALSE,
        reaction VARCHAR(16) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safe non-destructive schema upgrades (Preserves amit & golu accounts and data)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code VARCHAR(50) DEFAULT '0119';`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS username VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reaction VARCHAR(16) DEFAULT NULL;`);

    // Clean only legacy unrouted anonymous messages
    await pool.query(`DELETE FROM messages WHERE username = 'Anonymous' OR username IS NULL OR recipient IS NULL;`);
    console.log('PostgreSQL initialized and schema upgraded safely.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}
initDB();

// ================= AUTHENTICATION & PASSWORD ROUTES =================

// 1. Register (Strict 2-User VIP Limit)
app.post('/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const recoveryCode = (req.body.recoveryCode || MASTER_RECOVERY_PIN).trim() || MASTER_RECOVERY_PIN;

    if (!username || password.length < 6) {
      return res.status(400).json({ error: 'Username required and password must be at least 6 characters.' });
    }

    if (useDB) {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username already exists. Please Sign In.' });
      }

      const countRes = await pool.query('SELECT COUNT(*) FROM users');
      const totalUsers = parseInt(countRes.rows[0].count, 10);
      if (totalUsers >= 2) {
        return res.status(403).json({ error: 'Registration closed! This private app allows only 2 accounts.' });
      }

      const insertRes = await pool.query(
        'INSERT INTO users (username, password, recovery_code) VALUES ($1, $2, $3) RETURNING username',
        [username, password, recoveryCode]
      );
      return res.json({ success: true, username: insertRes.rows[0].username });
    } else {
      const exists = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (exists) {
        return res.status(409).json({ error: 'Username already exists. Please Sign In.' });
      }
      if (memoryUsers.length >= 2) {
        return res.status(403).json({ error: 'Registration closed! This private app allows only 2 accounts.' });
      }
      memoryUsers.push({ id: memoryUsers.length + 1, username, password, recovery_code: recoveryCode });
      return res.json({ success: true, username });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// 2. Sign In
app.post('/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password.' });
    }

    if (useDB) {
      const result = await pool.query(
        'SELECT username, password FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (result.rows.length === 0 || result.rows[0].password !== password) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      return res.json({ success: true, username: result.rows[0].username });
    } else {
      const user = memoryUsers.find(
        u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
      );
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      return res.json({ success: true, username: user.username });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during sign in.' });
  }
});

// 3. Change Password (When Old Password is Known)
app.post('/change-password', async (req, res) => {
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
      if (result.rows.length === 0 || result.rows[0].password !== oldPassword) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      const finalPin = newRecoveryCode || result.rows[0].recovery_code || MASTER_RECOVERY_PIN;
      await pool.query(
        'UPDATE users SET password = $1, recovery_code = $2 WHERE id = $3',
        [newPassword, finalPin, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password updated successfully!' });
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user || user.password !== oldPassword) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      user.password = newPassword;
      if (newRecoveryCode) user.recovery_code = newRecoveryCode;
      return res.json({ success: true, message: 'Password updated successfully!' });
    }
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

// 4. Forgot / Reset Password (Using Secret Recovery PIN or Master PIN 0119)
app.post('/reset-password', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const recoveryCode = (req.body.recoveryCode || '').trim();
    const newPassword = req.body.newPassword || '';

    if (!username || !recoveryCode || newPassword.length < 6) {
      return res.status(400).json({ error: 'Enter username, secret recovery PIN, and new password (min 6 chars).' });
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
      if (recoveryCode !== savedPin && recoveryCode !== MASTER_RECOVERY_PIN) {
        return res.status(401).json({ error: 'Invalid Secret Recovery PIN!' });
      }
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, result.rows[0].id]);
      return res.json({ success: true, message: 'Password reset complete! You can now Sign In.' });
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      const savedPin = user.recovery_code || MASTER_RECOVERY_PIN;
      if (recoveryCode !== savedPin && recoveryCode !== MASTER_RECOVERY_PIN) {
        return res.status(401).json({ error: 'Invalid Secret Recovery PIN!' });
      }
      user.password = newPassword;
      return res.json({ success: true, message: 'Password reset complete! You can now Sign In.' });
    }
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error resetting password.' });
  }
});

// 5. Delete Account (Using Password OR Secret Recovery PIN / 0119)
app.post('/delete-account', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const recoveryCode = (req.body.recoveryCode || req.body.confirmation || '').trim();

    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

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
      const isPinValid = (recoveryCode && (recoveryCode === savedPin || recoveryCode === MASTER_RECOVERY_PIN));
      const isPassValid = (password && password === user.password);

      if (!isPinValid && !isPassValid) {
        return res.status(401).json({ error: 'Invalid password or Secret PIN (0119).' });
      }

      const exactUsername = user.username;
      await pool.query('DELETE FROM messages WHERE username = $1 OR recipient = $1', [exactUsername]);
      await pool.query('DELETE FROM friendships WHERE requester = $1 OR recipient = $1', [exactUsername]);
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    } else {
      const idx = memoryUsers.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
      if (idx === -1) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const user = memoryUsers[idx];
      const savedPin = user.recovery_code || MASTER_RECOVERY_PIN;
      const isPinValid = (recoveryCode && (recoveryCode === savedPin || recoveryCode === MASTER_RECOVERY_PIN));
      const isPassValid = (password && password === user.password);

      if (!isPinValid && !isPassValid) {
        return res.status(401).json({ error: 'Invalid password or Secret PIN (0119).' });
      }

      const exactUsername = user.username;
      memoryUsers.splice(idx, 1);

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

    // Disconnect any active sockets for this user
    const set = userSockets.get(username);
    if (set) {
      for (const sockId of set) {
        const s = io.sockets.sockets.get(sockId);
        if (s) {
          s.emit('account-deleted');
          s.disconnect(true);
        }
      }
      userSockets.delete(username);
    }

    await broadcastSocialUpdates();
    return res.json({ success: true, message: `Account '${username}' has been deleted successfully.` });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Server error deleting account.' });
  }
});

// 6. Reset All Accounts (Master PIN: 0119)
app.post('/reset-all-accounts', async (req, res) => {
  try {
    const pin = (req.body.pin || req.body.recoveryCode || '').trim();
    if (pin !== MASTER_RECOVERY_PIN) {
      return res.status(401).json({ error: 'Unauthorized: Master PIN 0119 required.' });
    }

    if (useDB) {
      await pool.query('DELETE FROM messages');
      await pool.query('DELETE FROM friendships');
      await pool.query('DELETE FROM users');
    } else {
      memoryUsers.length = 0;
      memoryFriendships.length = 0;
      memoryMessages.length = 0;
    }

    for (const [uname, set] of userSockets.entries()) {
      for (const sockId of set) {
        const s = io.sockets.sockets.get(sockId);
        if (s) {
          s.emit('account-deleted');
          s.disconnect(true);
        }
      }
    }
    userSockets.clear();

    return res.json({ success: true, message: 'All accounts, friendships, and messages have been reset.' });
  } catch (err) {
    console.error('Reset all accounts error:', err);
    res.status(500).json({ error: 'Server error resetting accounts.' });
  }
});

// ================= HELPER FUNCTIONS FOR SOCIAL & CHAT =================

const userSockets = new Map();

function isUserOnline(username) {
  const set = userSockets.get(username);
  return Boolean(set && set.size > 0);
}

function emitToUser(username, event, payload) {
  const set = userSockets.get(username);
  if (set) {
    for (const sockId of set) {
      io.to(sockId).emit(event, payload);
    }
  }
}

async function getSocialDataForUser(username) {
  let allUsers = [];
  let relations = [];

  if (useDB) {
    const uRes = await pool.query('SELECT username FROM users WHERE username != $1', [username]);
    allUsers = uRes.rows.map(r => r.username);

    const fRes = await pool.query(
      'SELECT requester, recipient, status FROM friendships WHERE requester = $1 OR recipient = $1',
      [username]
    );
    relations = fRes.rows;
  } else {
    allUsers = memoryUsers.filter(u => u.username !== username).map(u => u.username);
    relations = memoryFriendships.filter(f => f.requester === username || f.recipient === username);
  }

  const friends = [];
  const requests = [];
  const discover = [];

  for (const other of allUsers) {
    const rel = relations.find(
      r => (r.requester === username && r.recipient === other) ||
           (r.requester === other && r.recipient === username)
    );

    const online = isUserOnline(other);

    if (!rel) {
      discover.push({ username: other, status: 'none', online });
    } else if (rel.status === 'accepted') {
      friends.push({ username: other, online });
    } else if (rel.status === 'pending') {
      if (rel.recipient === username) {
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
  if (useDB) {
    const res = await pool.query(
      `SELECT 1 FROM friendships
       WHERE ((requester = $1 AND recipient = $2) OR (requester = $2 AND recipient = $1))
       AND status = 'accepted'`,
      [userA, userB]
    );
    return res.rows.length > 0;
  } else {
    return memoryFriendships.some(
      f => ((f.requester === userA && f.recipient === userB) ||
            (f.requester === userB && f.recipient === userA)) &&
           f.status === 'accepted'
    );
  }
}

// ================= SOCKET.IO REAL-TIME ENGINE =================

io.on('connection', async (socket) => {
  const username = (socket.handshake.query.username || '').trim();
  if (!username) {
    socket.disconnect();
    return;
  }

  socket.username = username;
  if (!userSockets.has(username)) {
    userSockets.set(username, new Set());
  }
  userSockets.get(username).add(socket.id);

  await broadcastSocialUpdates();

  socket.on('request-social-data', async () => {
    const data = await getSocialDataForUser(username);
    socket.emit('social-data', data);
  });

  // Send Friend Request
  socket.on('send-friend-request', async ({ to }) => {
    if (!to || to === username) return;
    try {
      if (useDB) {
        await pool.query(
          `INSERT INTO friendships (requester, recipient, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (requester, recipient) DO NOTHING`,
          [username, to]
        );
      } else {
        const exists = memoryFriendships.find(
          f => (f.requester === username && f.recipient === to) ||
               (f.requester === to && f.recipient === username)
        );
        if (!exists) {
          memoryFriendships.push({ id: Date.now(), requester: username, recipient: to, status: 'pending' });
        }
      }
      await broadcastSocialUpdates();
    } catch (err) {
      console.error('Friend request error:', err);
    }
  });

  // Accept or Decline Friend Request
  socket.on('respond-friend-request', async ({ requester, action }) => {
    if (!requester) return;
    try {
      if (useDB) {
        if (action === 'accept') {
          await pool.query(
            `UPDATE friendships SET status = 'accepted' WHERE requester = $1 AND recipient = $2`,
            [requester, username]
          );
        } else {
          await pool.query(
            `DELETE FROM friendships WHERE requester = $1 AND recipient = $2`,
            [requester, username]
          );
        }
      } else {
        const idx = memoryFriendships.findIndex(
          f => f.requester === requester && f.recipient === username
        );
        if (idx !== -1) {
          if (action === 'accept') {
            memoryFriendships[idx].status = 'accepted';
          } else {
            memoryFriendships.splice(idx, 1);
          }
        }
      }
      await broadcastSocialUpdates();
    } catch (err) {
      console.error('Respond friend request error:', err);
    }
  });

  // Load Strict 1-on-1 Private Chat History
  socket.on('load-private-chat', async ({ friend }) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      if (useDB) {
        // Mark incoming messages from friend as seen
        await pool.query(
          `UPDATE messages SET seen = TRUE WHERE username = $1 AND recipient = $2 AND seen = FALSE`,
          [friend, username]
        );

        const res = await pool.query(
          `SELECT id, username, recipient, text, seen, reaction, created_at
           FROM messages
           WHERE (username = $1 AND recipient = $2)
              OR (username = $2 AND recipient = $1)
           ORDER BY id ASC`,
          [username, friend]
        );
        socket.emit('private-chat-history', { friend, messages: res.rows });
      } else {
        memoryMessages.forEach(m => {
          if (m.username === friend && m.recipient === username) m.seen = true;
        });
        const msgs = memoryMessages.filter(
          m => (m.username === username && m.recipient === friend) ||
               (m.username === friend && m.recipient === username)
        );
        socket.emit('private-chat-history', { friend, messages: msgs });
      }

      if (isUserOnline(friend)) {
        emitToUser(friend, 'messages-seen', { by: username });
      }
    } catch (err) {
      console.error('Load private chat error:', err);
    }
  });

  // Send 1-on-1 Private Message (Works Offline & Online!)
  socket.on('private-message', async ({ to, text }) => {
    const cleanText = (text || '').trim();
    if (!to || !cleanText) return;

    try {
      const allowed = await areFriends(username, to);
      if (!allowed) return;

      let savedMsg = null;
      if (useDB) {
        const res = await pool.query(
          `INSERT INTO messages (username, recipient, text, seen, reaction)
           VALUES ($1, $2, $3, FALSE, NULL)
           RETURNING id, username, recipient, text, seen, reaction, created_at`,
          [username, to, cleanText]
        );
        savedMsg = res.rows[0];
      } else {
        savedMsg = {
          id: msgIdCounter++,
          username,
          recipient: to,
          text: cleanText,
          seen: false,
          reaction: null,
          created_at: new Date().toISOString()
        };
        memoryMessages.push(savedMsg);
      }

      // Always emit back to sender immediately
      emitToUser(username, 'private-message', savedMsg);

      // If recipient is online, emit in real-time; if offline, it stays safely in DB
      if (isUserOnline(to)) {
        emitToUser(to, 'private-message', savedMsg);
      }
    } catch (err) {
      console.error('Send private message error:', err);
    }
  });

  // Mark Messages as Seen in Real-Time
  socket.on('mark-seen', async ({ friend }) => {
    if (!friend) return;
    try {
      if (useDB) {
        await pool.query(
          `UPDATE messages SET seen = TRUE WHERE username = $1 AND recipient = $2 AND seen = FALSE`,
          [friend, username]
        );
      } else {
        memoryMessages.forEach(m => {
          if (m.username === friend && m.recipient === username) m.seen = true;
        });
      }
      if (isUserOnline(friend)) {
        emitToUser(friend, 'messages-seen', { by: username });
      }
    } catch (err) {
      console.error('Mark seen error:', err);
    }
  });

  // Typing Indicators
  socket.on('typing', ({ to }) => {
    if (to && isUserOnline(to)) {
      emitToUser(to, 'typing', { from: username });
    }
  });

  socket.on('stop-typing', ({ to }) => {
    if (to && isUserOnline(to)) {
      emitToUser(to, 'stop-typing', { from: username });
    }
  });

  // Heart Reaction on Message
  socket.on('react-message', async ({ id, friend }) => {
    if (!id) return;
    try {
      if (useDB) {
        const cur = await pool.query('SELECT reaction FROM messages WHERE id = $1', [id]);
        if (cur.rows.length === 0) return;
        const nextReaction = cur.rows[0].reaction ? null : '❤️';
        await pool.query('UPDATE messages SET reaction = $1 WHERE id = $2', [nextReaction, id]);
        emitToUser(username, 'message-reacted', { id, reaction: nextReaction });
        if (friend && isUserOnline(friend)) {
          emitToUser(friend, 'message-reacted', { id, reaction: nextReaction });
        }
      } else {
        const msg = memoryMessages.find(m => String(m.id) === String(id));
        if (!msg) return;
        msg.reaction = msg.reaction ? null : '❤️';
        emitToUser(username, 'message-reacted', { id, reaction: msg.reaction });
        if (friend && isUserOnline(friend)) {
          emitToUser(friend, 'message-reacted', { id, reaction: msg.reaction });
        }
      }
    } catch (err) {
      console.error('React message error:', err);
    }
  });

  // Delete Single Message
  socket.on('delete-message', async ({ id, friend }) => {
    if (!id) return;
    try {
      if (useDB) {
        const res = await pool.query(
          'DELETE FROM messages WHERE id = $1 AND username = $2 RETURNING id',
          [id, username]
        );
        if (res.rows.length > 0) {
          emitToUser(username, 'message-deleted', id);
          if (friend) emitToUser(friend, 'message-deleted', id);
        }
      } else {
        const idx = memoryMessages.findIndex(m => String(m.id) === String(id) && m.username === username);
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

  // Clear Entire 1-on-1 Chat History
  socket.on('clear-chat', async ({ friend }) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) return;

      if (useDB) {
        await pool.query(
          `DELETE FROM messages
           WHERE (username = $1 AND recipient = $2)
              OR (username = $2 AND recipient = $1)`,
          [username, friend]
        );
      } else {
        for (let i = memoryMessages.length - 1; i >= 0; i--) {
          const m = memoryMessages[i];
          if (
            (m.username === username && m.recipient === friend) ||
            (m.username === friend && m.recipient === username)
          ) {
            memoryMessages.splice(i, 1);
          }
        }
      }
      emitToUser(username, 'chat-cleared', { friend });
      if (isUserOnline(friend)) {
        emitToUser(friend, 'chat-cleared', { friend: username });
      }
    } catch (err) {
      console.error('Clear chat error:', err);
    }
  });

  // ================= WEBRTC AUDIO/VIDEO SIGNALING =================

  socket.on('call-user', async ({ to, offer, isVideo }) => {
    if (!to || !offer) return;
    const allowed = await areFriends(username, to);
    if (!allowed || !isUserOnline(to)) {
      socket.emit('call-error', { message: `${to} is currently offline.` });
      return;
    }
    emitToUser(to, 'incoming-call', {
      from: username,
      offer,
      isVideo: Boolean(isVideo)
    });
  });

  socket.on('make-answer', ({ to, answer }) => {
    if (!to || !answer) return;
    emitToUser(to, 'call-answered', {
      from: username,
      answer
    });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;
    emitToUser(to, 'ice-candidate', {
      from: username,
      candidate
    });
  });

  socket.on('call-media-state', ({ to, micEnabled, camEnabled }) => {
    if (!to) return;
    emitToUser(to, 'call-media-state', {
      from: username,
      micEnabled,
      camEnabled
    });
  });

  socket.on('reject-call', ({ to }) => {
    if (!to) return;
    emitToUser(to, 'call-rejected', { from: username });
  });

  socket.on('end-call', ({ to }) => {
    if (!to) return;
    emitToUser(to, 'call-ended', { from: username });
  });

  socket.on('disconnect', async () => {
    const set = userSockets.get(username);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(username);
      }
    }
    await broadcastSocialUpdates();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});