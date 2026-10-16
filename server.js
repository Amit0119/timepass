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
const memoryUsers = []; // { id, username, password }
const memoryFriendships = []; // { id, requester, recipient, status }
const memoryMessages = []; // { id, username, recipient, text, created_at }
let msgIdCounter = 1;

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
        password VARCHAR(100) NOT NULL
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure columns exist for seamless schema backward-compatibility
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS username VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient VARCHAR(50);`);
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    // Safely backfill legacy columns if they exist (without deleting anything)
    await pool.query(`UPDATE messages SET created_at = timestamp WHERE created_at IS NULL AND timestamp IS NOT NULL;`).catch(() => {});
    await pool.query(`UPDATE messages SET recipient = receiver WHERE recipient IS NULL AND receiver IS NOT NULL;`).catch(() => {});

    console.log('PostgreSQL schema verified and ready. User data and messages are preserved.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}
initDB();

// ================= AUTHENTICATION ROUTES (WITH 2-USER LIMIT) =================

app.post('/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || password.length < 6) {
      return res.status(400).json({ error: 'Username required and password must be at least 6 characters.' });
    }

    if (useDB) {
      // Check if username already exists
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username already exists. Please Sign In.' });
      }

      // STRICT 2-USER LIMIT CHECK
      const countRes = await pool.query('SELECT COUNT(*) FROM users');
      const totalUsers = parseInt(countRes.rows[0].count, 10);
      if (totalUsers >= 2) {
        return res.status(403).json({ error: 'Registration closed! This private app allows only 2 accounts.' });
      }

      const insertRes = await pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING username',
        [username, password]
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
      memoryUsers.push({ id: memoryUsers.length + 1, username, password });
      return res.json({ success: true, username });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

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

// ================= HELPER FUNCTIONS FOR SOCIAL & CHAT =================

// Map: lowercase username -> Set of socket IDs
const userSockets = new Map();

function getUserSocketSet(username) {
  if (!username) return null;
  return userSockets.get(username.toLowerCase()) || null;
}

function isUserOnline(username) {
  const set = getUserSocketSet(username);
  return Boolean(set && set.size > 0);
}

function emitToUser(username, event, payload) {
  const set = getUserSocketSet(username);
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
    const uRes = await pool.query('SELECT username FROM users WHERE LOWER(username) != LOWER($1)', [username]);
    allUsers = uRes.rows.map(r => r.username);

    const fRes = await pool.query(
      'SELECT requester, recipient, status FROM friendships WHERE LOWER(requester) = LOWER($1) OR LOWER(recipient) = LOWER($1)',
      [username]
    );
    relations = fRes.rows;
  } else {
    const uLower = username.toLowerCase();
    allUsers = memoryUsers.filter(u => u.username.toLowerCase() !== uLower).map(u => u.username);
    relations = memoryFriendships.filter(f => f.requester.toLowerCase() === uLower || f.recipient.toLowerCase() === uLower);
  }

  const friends = [];
  const requests = [];
  const discover = [];

  for (const other of allUsers) {
    const uLower = username.toLowerCase();
    const otherLower = other.toLowerCase();
    const rel = relations.find(
      r => (r.requester.toLowerCase() === uLower && r.recipient.toLowerCase() === otherLower) ||
           (r.requester.toLowerCase() === otherLower && r.recipient.toLowerCase() === uLower)
    );

    const online = isUserOnline(other);

    if (!rel) {
      discover.push({ username: other, status: 'none', online });
    } else if (rel.status === 'accepted') {
      friends.push({ username: other, online });
    } else if (rel.status === 'pending') {
      if (rel.recipient.toLowerCase() === uLower) {
        requests.push({ username: other, online });
      } else {
        discover.push({ username: other, status: 'requested', online });
      }
    }
  }

  return { friends, requests, discover };
}

async function broadcastSocialUpdates() {
  for (const [userKey] of userSockets.entries()) {
    try {
      const data = await getSocialDataForUser(userKey);
      emitToUser(userKey, 'social-data', data);
    } catch (e) {
      console.error('Error broadcasting social data:', e);
    }
  }
}

async function areFriends(userA, userB) {
  if (!userA || !userB) return false;
  if (useDB) {
    const res = await pool.query(
      `SELECT 1 FROM friendships
       WHERE ((LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2))
          OR (LOWER(requester) = LOWER($2) AND LOWER(recipient) = LOWER($1)))
       AND status = 'accepted'`,
      [userA, userB]
    );
    return res.rows.length > 0;
  } else {
    const aLower = userA.toLowerCase();
    const bLower = userB.toLowerCase();
    return memoryFriendships.some(
      f => ((f.requester.toLowerCase() === aLower && f.recipient.toLowerCase() === bLower) ||
            (f.requester.toLowerCase() === bLower && f.recipient.toLowerCase() === aLower)) &&
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
  const userKey = username.toLowerCase();
  if (!userSockets.has(userKey)) {
    userSockets.set(userKey, new Set());
  }
  userSockets.get(userKey).add(socket.id);

  // Send updated friend/online states to connected users
  await broadcastSocialUpdates();

  socket.on('request-social-data', async () => {
    const data = await getSocialDataForUser(username);
    socket.emit('social-data', data);
  });

  // Send Friend Request
  socket.on('send-friend-request', async ({ to }) => {
    if (!to || to.toLowerCase() === username.toLowerCase()) return;
    try {
      if (useDB) {
        const existing = await pool.query(
          `SELECT id, status FROM friendships
           WHERE (LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(requester) = LOWER($2) AND LOWER(recipient) = LOWER($1))`,
          [username, to]
        );
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO friendships (requester, recipient, status)
             VALUES ($1, $2, 'pending')`,
            [username, to]
          );
        }
      } else {
        const uLower = username.toLowerCase();
        const toLower = to.toLowerCase();
        const exists = memoryFriendships.find(
          f => (f.requester.toLowerCase() === uLower && f.recipient.toLowerCase() === toLower) ||
               (f.requester.toLowerCase() === toLower && f.recipient.toLowerCase() === uLower)
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
            `UPDATE friendships SET status = 'accepted'
             WHERE LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2)`,
            [requester, username]
          );
        } else {
          await pool.query(
            `DELETE FROM friendships
             WHERE LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2)`,
            [requester, username]
          );
        }
      } else {
        const reqLower = requester.toLowerCase();
        const uLower = username.toLowerCase();
        const idx = memoryFriendships.findIndex(
          f => f.requester.toLowerCase() === reqLower && f.recipient.toLowerCase() === uLower
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

  // Load 1-on-1 Private Chat History (Strict Isolation: Only messages between username and friend)
  socket.on('load-private-chat', async ({ friend }) => {
    if (!friend) return;
    try {
      const allowed = await areFriends(username, friend);
      if (!allowed) {
        socket.emit('private-chat-history', { friend, messages: [] });
        return;
      }

      if (useDB) {
        // Strict 1-on-1 Chat Isolation:
        // Returns strictly messages exchanged ONLY between this exact pair
        const res = await pool.query(
          `SELECT id, username, recipient, text, created_at
           FROM messages
           WHERE (LOWER(username) = LOWER($1) AND LOWER(recipient) = LOWER($2))
              OR (LOWER(username) = LOWER($2) AND LOWER(recipient) = LOWER($1))
           ORDER BY id ASC`,
          [username, friend]
        );
        socket.emit('private-chat-history', { friend, messages: res.rows });
      } else {
        const uLower = username.toLowerCase();
        const fLower = friend.toLowerCase();
        const msgs = memoryMessages.filter(
          m => (m.username && m.recipient && (
            (m.username.toLowerCase() === uLower && m.recipient.toLowerCase() === fLower) ||
            (m.username.toLowerCase() === fLower && m.recipient.toLowerCase() === uLower)
          ))
        );
        socket.emit('private-chat-history', { friend, messages: msgs });
      }
    } catch (err) {
      console.error('Load private chat error:', err);
      socket.emit('private-chat-history', { friend, messages: [] });
    }
  });

  // Send 1-on-1 Private Message (Offline Delivery Support & Strict Isolation)
  socket.on('private-message', async ({ to, text }) => {
    const cleanText = (text || '').trim();
    if (!to || !cleanText) return;

    try {
      const allowed = await areFriends(username, to);
      if (!allowed) {
        socket.emit('chat-error', { error: 'You can only message accepted friends.' });
        return;
      }

      let savedMsg = null;
      if (useDB) {
        const res = await pool.query(
          `INSERT INTO messages (username, recipient, text)
           VALUES ($1, $2, $3)
           RETURNING id, username, recipient, text, created_at`,
          [username, to, cleanText]
        );
        savedMsg = res.rows[0];
      } else {
        savedMsg = {
          id: msgIdCounter++,
          username,
          recipient: to,
          text: cleanText,
          created_at: new Date().toISOString()
        };
        memoryMessages.push(savedMsg);
      }

      // 1. Instantly emit back to sender's socket(s) for UI confirmation
      emitToUser(username, 'private-message', savedMsg);

      // 2. If recipient is online, forward in real-time
      if (to.toLowerCase() !== username.toLowerCase() && isUserOnline(to)) {
        emitToUser(to, 'private-message', savedMsg);
      }
      // If offline, the message is safely stored in DB and will load on their next sign-in!
    } catch (err) {
      console.error('Send private message error:', err);
      socket.emit('chat-error', { error: 'Failed to send message.' });
    }
  });

  // Delete Own Message
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
          if (friend && isUserOnline(friend)) {
            emitToUser(friend, 'message-deleted', id);
          }
        }
      } else {
        const uLower = username.toLowerCase();
        const idx = memoryMessages.findIndex(m => String(m.id) === String(id) && m.username.toLowerCase() === uLower);
        if (idx !== -1) {
          memoryMessages.splice(idx, 1);
          emitToUser(username, 'message-deleted', id);
          if (friend && isUserOnline(friend)) {
            emitToUser(friend, 'message-deleted', id);
          }
        }
      }
    } catch (err) {
      console.error('Delete message error:', err);
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

  socket.on('reject-call', ({ to }) => {
    if (!to) return;
    emitToUser(to, 'call-rejected', { from: username });
  });

  socket.on('end-call', ({ to }) => {
    if (!to) return;
    emitToUser(to, 'call-ended', { from: username });
  });

  socket.on('disconnect', async () => {
    const userKey = username.toLowerCase();
    const set = userSockets.get(userKey);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(userKey);
      }
    }
    await broadcastSocialUpdates();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
