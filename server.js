const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middleware to parse JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory fallback stores for local testing without PostgreSQL
const memoryUsers = new Map(); // username.toLowerCase() -> { username, password }
const memoryMessages = [];
const memoryFriendships = []; // [{ id, requester, recipient, status }]
let memoryFriendshipIdCounter = 1;

// Socket & user tracking
// userSockets: username.toLowerCase() -> Set<socket.id>
const userSockets = new Map();
// socketUsers: socket.id -> username
const socketUsers = new Map();

function addUserSocket(username, socketId) {
    const key = username.toLowerCase();
    if (!userSockets.has(key)) {
        userSockets.set(key, new Set());
    }
    userSockets.get(key).add(socketId);
    socketUsers.set(socketId, username);
}

function removeUserSocket(socketId) {
    const username = socketUsers.get(socketId);
    if (username) {
        const key = username.toLowerCase();
        const sockets = userSockets.get(key);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                userSockets.delete(key);
            }
        }
        socketUsers.delete(socketId);
    }
    return username;
}

function isUserOnline(username) {
    if (!username) return false;
    const sockets = userSockets.get(username.toLowerCase());
    return Boolean(sockets && sockets.size > 0);
}

function getUserPrimarySocketId(username) {
    if (!username) return null;
    const sockets = userSockets.get(username.toLowerCase());
    return sockets && sockets.size > 0 ? Array.from(sockets)[0] : null;
}

let pool;
try {
    if (process.env.DATABASE_URL) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            },
            connectionTimeoutMillis: 3000,
            query_timeout: 3000
        });
        
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });

        const initQuery = pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(100) NOT NULL
          );
          CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            text TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            socket_id VARCHAR(255),
            username VARCHAR(50)
          );
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS username VARCHAR(50);
          ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver VARCHAR(50);
          CREATE TABLE IF NOT EXISTS friendships (
            id SERIAL PRIMARY KEY,
            requester VARCHAR(50) NOT NULL,
            recipient VARCHAR(50) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_friendship UNIQUE (requester, recipient)
          );
        `);
        
        Promise.race([
            initQuery,
            new Promise((_, reject) => setTimeout(() => reject(new Error("DB Init Timeout")), 5000))
        ]).then(() => {
          console.log("Database tables (users, messages, friendships) ensured.");
        }).catch(err => {
          console.error("Error creating tables (might be hanging or offline):", err.message);
        });
    } else {
        console.warn("DATABASE_URL is not set. Running in memory-only mode.");
    }
} catch (err) {
    console.error("Failed to initialize PostgreSQL pool:", err);
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==================== HELPER FUNCTIONS FOR FRIENDSHIPS ====================

async function getFriendsData(username) {
    const uname = String(username || '').trim();
    if (!uname) return { friends: [], incomingRequests: [], outgoingRequests: [] };
    const unameLower = uname.toLowerCase();

    let acceptedFriends = [];
    let incomingRequests = [];
    let outgoingRequests = [];

    if (pool) {
        try {
            // Fetch accepted friendships
            const friendsRes = await pool.query(
                `SELECT id, requester, recipient, status 
                 FROM friendships 
                 WHERE (LOWER(requester) = LOWER($1) OR LOWER(recipient) = LOWER($1)) 
                   AND status = 'accepted'`,
                [uname]
            );
            acceptedFriends = friendsRes.rows.map(row => {
                const friendName = row.requester.toLowerCase() === unameLower ? row.recipient : row.requester;
                return {
                    friendshipId: row.id,
                    username: friendName,
                    isOnline: isUserOnline(friendName),
                    socketId: getUserPrimarySocketId(friendName)
                };
            });

            // Fetch incoming pending requests
            const incomingRes = await pool.query(
                `SELECT id, requester, recipient, created_at 
                 FROM friendships 
                 WHERE LOWER(recipient) = LOWER($1) AND status = 'pending'`,
                [uname]
            );
            incomingRequests = incomingRes.rows.map(row => ({
                id: row.id,
                fromUsername: row.requester,
                isOnline: isUserOnline(row.requester)
            }));

            // Fetch outgoing pending requests
            const outgoingRes = await pool.query(
                `SELECT recipient 
                 FROM friendships 
                 WHERE LOWER(requester) = LOWER($1) AND status = 'pending'`,
                [uname]
            );
            outgoingRequests = outgoingRes.rows.map(row => row.recipient);

        } catch (err) {
            console.error("DB error fetching friends data:", err.message);
        }
    } else {
        // In-memory fallback
        for (const f of memoryFriendships) {
            const reqLower = f.requester.toLowerCase();
            const recLower = f.recipient.toLowerCase();

            if (f.status === 'accepted') {
                if (reqLower === unameLower) {
                    acceptedFriends.push({
                        friendshipId: f.id,
                        username: f.recipient,
                        isOnline: isUserOnline(f.recipient),
                        socketId: getUserPrimarySocketId(f.recipient)
                    });
                } else if (recLower === unameLower) {
                    acceptedFriends.push({
                        friendshipId: f.id,
                        username: f.requester,
                        isOnline: isUserOnline(f.requester),
                        socketId: getUserPrimarySocketId(f.requester)
                    });
                }
            } else if (f.status === 'pending') {
                if (recLower === unameLower) {
                    incomingRequests.push({
                        id: f.id,
                        fromUsername: f.requester,
                        isOnline: isUserOnline(f.requester)
                    });
                } else if (reqLower === unameLower) {
                    outgoingRequests.push(f.recipient);
                }
            }
        }
    }

    return {
        friends: acceptedFriends,
        incomingRequests: incomingRequests,
        outgoingRequests: outgoingRequests
    };
}

async function notifyFriendsDataUpdated(username) {
    if (!username) return;
    const socketId = getUserPrimarySocketId(username);
    if (socketId) {
        const data = await getFriendsData(username);
        io.to(socketId).emit('friends-data-updated', data);
    }
}

async function notifyAllFriendsOfStatusChange(username) {
    if (!username) return;
    const data = await getFriendsData(username);
    for (const friend of data.friends) {
        notifyFriendsDataUpdated(friend.username);
    }
}

async function searchUsers(query, currentUsername) {
    const q = String(query || '').trim();
    const unameLower = currentUsername.toLowerCase();
    let allUsers = [];

    if (pool) {
        try {
            let res;
            if (q) {
                res = await pool.query(
                    `SELECT username FROM users WHERE LOWER(username) != LOWER($1) AND LOWER(username) LIKE LOWER($2) LIMIT 25`,
                    [currentUsername, `%${q}%`]
                );
            } else {
                res = await pool.query(
                    `SELECT username FROM users WHERE LOWER(username) != LOWER($1) LIMIT 25`,
                    [currentUsername]
                );
            }
            allUsers = res.rows.map(r => r.username);
        } catch (err) {
            console.error("DB error searching users:", err.message);
        }
    } else {
        // In-memory fallback
        for (const [key, userObj] of memoryUsers.entries()) {
            if (key !== unameLower) {
                if (!q || userObj.username.toLowerCase().includes(q.toLowerCase())) {
                    allUsers.push(userObj.username);
                }
            }
        }
    }

    const currentFriendsData = await getFriendsData(currentUsername);
    const friendNames = new Set(currentFriendsData.friends.map(f => f.username.toLowerCase()));
    const outgoingReqNames = new Set(currentFriendsData.outgoingRequests.map(u => u.toLowerCase()));
    const incomingReqMap = new Map();
    currentFriendsData.incomingRequests.forEach(r => {
        incomingReqMap.set(r.fromUsername.toLowerCase(), r.id);
    });

    const results = allUsers.map(uname => {
        const targetLower = uname.toLowerCase();
        let relation = 'none'; // 'none' | 'friends' | 'requested' | 'pending_received'
        let requestId = null;

        if (friendNames.has(targetLower)) {
            relation = 'friends';
        } else if (outgoingReqNames.has(targetLower)) {
            relation = 'requested';
        } else if (incomingReqMap.has(targetLower)) {
            relation = 'pending_received';
            requestId = incomingReqMap.get(targetLower);
        }

        return {
            username: uname,
            relation: relation,
            requestId: requestId,
            isOnline: isUserOnline(uname)
        };
    });

    return results;
}

async function sendFriendRequest(requester, recipient) {
    const reqTrim = String(requester || '').trim();
    const recTrim = String(recipient || '').trim();

    if (!reqTrim || !recTrim) {
        return { success: false, error: "Invalid usernames." };
    }

    if (reqTrim.toLowerCase() === recTrim.toLowerCase()) {
        return { success: false, error: "You cannot add yourself as a friend." };
    }

    // Check if recipient exists
    let recipientExists = false;
    if (pool) {
        try {
            const res = await pool.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [recTrim]);
            recipientExists = res.rows.length > 0;
        } catch (err) {
            console.error("DB error checking recipient:", err.message);
        }
    } else {
        recipientExists = memoryUsers.has(recTrim.toLowerCase());
    }

    if (!recipientExists) {
        return { success: false, error: "User not found." };
    }

    if (pool) {
        try {
            const check = await pool.query(
                `SELECT id, requester, recipient, status FROM friendships 
                 WHERE (LOWER(requester) = LOWER($1) AND LOWER(recipient) = LOWER($2))
                    OR (LOWER(requester) = LOWER($2) AND LOWER(recipient) = LOWER($1))`,
                [reqTrim, recTrim]
            );

            if (check.rows.length > 0) {
                const existing = check.rows[0];
                if (existing.status === 'accepted') {
                    return { success: false, error: "You are already friends." };
                }
                if (existing.requester.toLowerCase() === reqTrim.toLowerCase()) {
                    return { success: false, error: "Friend request already sent." };
                } else {
                    // Reciprocal request -> Auto-accept
                    await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [existing.id]);
                    await notifyFriendsDataUpdated(reqTrim);
                    await notifyFriendsDataUpdated(recTrim);
                    return { success: true, message: "Friend request accepted! You are now friends." };
                }
            }

            await pool.query(
                `INSERT INTO friendships (requester, recipient, status) VALUES ($1, $2, 'pending')`,
                [reqTrim, recTrim]
            );
            await notifyFriendsDataUpdated(reqTrim);
            await notifyFriendsDataUpdated(recTrim);
            return { success: true, message: "Friend request sent!" };
        } catch (err) {
            console.error("DB error sending friend request:", err.message);
            return { success: false, error: "Database error: " + err.message };
        }
    } else {
        // In-memory
        const existing = memoryFriendships.find(f => 
            (f.requester.toLowerCase() === reqTrim.toLowerCase() && f.recipient.toLowerCase() === recTrim.toLowerCase()) ||
            (f.requester.toLowerCase() === recTrim.toLowerCase() && f.recipient.toLowerCase() === reqTrim.toLowerCase())
        );

        if (existing) {
            if (existing.status === 'accepted') {
                return { success: false, error: "You are already friends." };
            }
            if (existing.requester.toLowerCase() === reqTrim.toLowerCase()) {
                return { success: false, error: "Friend request already sent." };
            } else {
                existing.status = 'accepted';
                await notifyFriendsDataUpdated(reqTrim);
                await notifyFriendsDataUpdated(recTrim);
                return { success: true, message: "Friend request accepted! You are now friends." };
            }
        }

        memoryFriendships.push({
            id: memoryFriendshipIdCounter++,
            requester: reqTrim,
            recipient: recTrim,
            status: 'pending'
        });

        await notifyFriendsDataUpdated(reqTrim);
        await notifyFriendsDataUpdated(recTrim);
        return { success: true, message: "Friend request sent!" };
    }
}

async function respondFriendRequest(requestId, recipient, action) {
    const recTrim = String(recipient || '').trim();
    const act = String(action || '').toLowerCase();

    if (act !== 'accept' && act !== 'decline') {
        return { success: false, error: "Invalid action." };
    }

    let requesterUsername = null;

    if (pool) {
        try {
            const check = await pool.query(
                `SELECT id, requester FROM friendships WHERE id = $1 AND LOWER(recipient) = LOWER($2)`,
                [requestId, recTrim]
            );
            if (check.rows.length === 0) {
                return { success: false, error: "Friend request not found." };
            }
            requesterUsername = check.rows[0].requester;

            if (act === 'accept') {
                await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [requestId]);
            } else {
                await pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
            }

            await notifyFriendsDataUpdated(recTrim);
            await notifyFriendsDataUpdated(requesterUsername);
            return { success: true, message: act === 'accept' ? 'Friend request accepted!' : 'Friend request declined.' };
        } catch (err) {
            console.error("DB error responding to friend request:", err.message);
            return { success: false, error: "Database error: " + err.message };
        }
    } else {
        const idx = memoryFriendships.findIndex(f => f.id == requestId && f.recipient.toLowerCase() === recTrim.toLowerCase());
        if (idx === -1) {
            return { success: false, error: "Friend request not found." };
        }

        requesterUsername = memoryFriendships[idx].requester;

        if (act === 'accept') {
            memoryFriendships[idx].status = 'accepted';
        } else {
            memoryFriendships.splice(idx, 1);
        }

        await notifyFriendsDataUpdated(recTrim);
        await notifyFriendsDataUpdated(requesterUsername);
        return { success: true, message: act === 'accept' ? 'Friend request accepted!' : 'Friend request declined.' };
    }
}

// ==================== AUTHENTICATION ROUTES ====================

// POST /register: Accepts username and password (min 6 chars, alphanumeric/symbols allowed)
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }

        const trimmedUser = String(username).trim();
        if (trimmedUser.length < 2 || trimmedUser.length > 50) {
            return res.status(400).json({ success: false, error: 'Username must be between 2 and 50 characters' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
        }

        if (pool) {
            try {
                // Strict 2-user limit check
                const countRes = await pool.query('SELECT COUNT(*) FROM users');
                const totalUsers = parseInt(countRes.rows[0].count, 10);
                if (totalUsers >= 2) {
                    return res.status(403).json({
                        success: false,
                        error: 'Registration closed. This is a private app limited to 2 users.'
                    });
                }

                const queryPromise = pool.query(
                    'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
                    [trimmedUser, password]
                );
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB insert timeout")), 3000));
                const result = await Promise.race([queryPromise, timeoutPromise]);
                const created = result.rows[0];
                return res.json({ success: true, message: 'User registered successfully', username: created.username });
            } catch (err) {
                if (err.code === '23505') {
                    return res.status(409).json({ success: false, error: 'Username is already taken' });
                }
                console.error("Database registration error:", err.message);
                return res.status(500).json({ success: false, error: 'Database error during registration: ' + err.message });
            }
        } else {
            // In-memory fallback
            if (memoryUsers.size >= 2) {
                return res.status(403).json({
                    success: false,
                    error: 'Registration closed. This is a private app limited to 2 users.'
                });
            }

            const lowerKey = trimmedUser.toLowerCase();
            if (memoryUsers.has(lowerKey)) {
                return res.status(409).json({ success: false, error: 'Username is already taken' });
            }
            memoryUsers.set(lowerKey, { username: trimmedUser, password: String(password) });
            return res.json({ success: true, message: 'User registered successfully (in-memory)', username: trimmedUser });
        }
    } catch (err) {
        console.error("Server error on register:", err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /login: Accepts username and password. Verifies against users table.
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }

        const trimmedUser = String(username).trim();

        if (pool) {
            try {
                const queryPromise = pool.query(
                    'SELECT id, username, password FROM users WHERE LOWER(username) = LOWER($1)',
                    [trimmedUser]
                );
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB query timeout")), 3000));
                const result = await Promise.race([queryPromise, timeoutPromise]);

                if (result.rows.length === 0 || result.rows[0].password !== String(password)) {
                    return res.status(401).json({ success: false, error: 'Invalid username or password' });
                }

                return res.json({ success: true, username: result.rows[0].username });
            } catch (err) {
                console.error("Database login error:", err.message);
                return res.status(500).json({ success: false, error: 'Database error during login: ' + err.message });
            }
        } else {
            // In-memory fallback
            const lowerKey = trimmedUser.toLowerCase();
            const existing = memoryUsers.get(lowerKey);
            if (!existing || existing.password !== String(password)) {
                return res.status(401).json({ success: false, error: 'Invalid username or password' });
            }
            return res.json({ success: true, username: existing.username });
        }
    } catch (err) {
        console.error("Server error on login:", err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ==================== REST ENDPOINTS FOR FRIEND SYSTEM ====================

app.get('/api/friends', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: "Username required" });
    const data = await getFriendsData(username);
    res.json({ success: true, data });
});

app.get('/api/users/search', async (req, res) => {
    const { q, username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: "Username required" });
    const results = await searchUsers(q, username);
    res.json({ success: true, results });
});

app.post('/api/friends/request', async (req, res) => {
    const { requester, recipient } = req.body;
    const result = await sendFriendRequest(requester, recipient);
    res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/friends/respond', async (req, res) => {
    const { requestId, recipient, action } = req.body;
    const result = await respondFriendRequest(requestId, recipient, action);
    res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/reset', async (req, res) => {
    try {
        if (pool) {
            await pool.query('DELETE FROM friendships');
            await pool.query('DELETE FROM messages');
            await pool.query('DELETE FROM users');
        }
        memoryUsers.clear();
        memoryMessages.length = 0;
        memoryFriendships.length = 0;
        console.log("All accounts, friendships, and messages have been reset/deleted.");
        res.json({ success: true, message: "All accounts and data have been wiped clean." });
    } catch (err) {
        console.error("Error resetting data:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Also support GET /api/reset for easy browser-click wipe
app.get('/api/reset', async (req, res) => {
    try {
        if (pool) {
            await pool.query('DELETE FROM friendships');
            await pool.query('DELETE FROM messages');
            await pool.query('DELETE FROM users');
        }
        memoryUsers.clear();
        memoryMessages.length = 0;
        memoryFriendships.length = 0;
        console.log("All accounts, friendships, and messages have been reset/deleted via browser.");
        res.send("<h2>All user accounts, friendships, and chat messages have been successfully deleted!</h2><p><a href='/'>Go to Login / Register</a></p>");
    } catch (err) {
        console.error("Error resetting data:", err);
        res.status(500).send("Error: " + err.message);
    }
});

// ==================== REAL-TIME SOCKET.IO & WEBRTC SIGNALING ====================

io.on('connection', async (socket) => {
    const username = socket.handshake.query.username || 'Anonymous';
    socket.username = username;

    addUserSocket(username, socket.id);
    console.log(`User connected: ${username} (socket ID: ${socket.id})`);

    // Send initial friends data to this user
    const friendsData = await getFriendsData(username);
    socket.emit('friends-data-updated', friendsData);

    // Notify user's friends that this user is now online
    await notifyAllFriendsOfStatusChange(username);

    // Fetch 1-on-1 Chat History for a specific selected friend
    socket.on('get-chat-history', async (data) => {
        const friend = data && data.friendUsername ? String(data.friendUsername).trim() : '';
        if (!friend || !socket.username) return;

        let history = [];
        if (pool) {
            try {
                const queryPromise = pool.query(
                    `SELECT * FROM (
                        SELECT id, socket_id, username, receiver, text, timestamp 
                        FROM messages 
                        WHERE (LOWER(username) = LOWER($1) AND LOWER(receiver) = LOWER($2))
                           OR (LOWER(username) = LOWER($2) AND LOWER(receiver) = LOWER($1))
                        ORDER BY timestamp DESC LIMIT 100
                    ) AS recent ORDER BY timestamp ASC`,
                    [socket.username, friend]
                );
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("History fetch timeout")), 3000));
                const res = await Promise.race([queryPromise, timeoutPromise]);
                history = res.rows.map(row => ({
                    id: row.id,
                    socket_id: row.socket_id,
                    username: row.username,
                    receiver: row.receiver,
                    text: row.text,
                    time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }));
            } catch (err) {
                console.error("Error fetching private history from DB:", err.message);
            }
        } else {
            const selfLower = socket.username.toLowerCase();
            const friendLower = friend.toLowerCase();
            history = memoryMessages.filter(m => 
                (m.username && m.receiver && (
                    (m.username.toLowerCase() === selfLower && m.receiver.toLowerCase() === friendLower) ||
                    (m.username.toLowerCase() === friendLower && m.receiver.toLowerCase() === selfLower)
                ))
            );
        }

        socket.emit('chat history', { friendUsername: friend, history });
    });

    // ==================== FRIEND SYSTEM SOCKET LISTENERS ====================

    socket.on('get-friends-data', async () => {
        const data = await getFriendsData(socket.username);
        socket.emit('friends-data-updated', data);
    });

    socket.on('search-users', async (data, callback) => {
        const query = data && data.query ? data.query : '';
        const results = await searchUsers(query, socket.username);
        if (typeof callback === 'function') {
            callback({ success: true, results });
        } else {
            socket.emit('search-users-results', results);
        }
    });

    socket.on('send-friend-request', async (data, callback) => {
        const toUsername = data && data.toUsername ? data.toUsername : '';
        const result = await sendFriendRequest(socket.username, toUsername);
        if (typeof callback === 'function') {
            callback(result);
        }
    });

    socket.on('respond-friend-request', async (data, callback) => {
        const { requestId, action } = data || {};
        const result = await respondFriendRequest(requestId, socket.username, action);
        if (typeof callback === 'function') {
            callback(result);
        }
    });

    // ==================== PRIVATE 1-ON-1 CHAT MESSAGING ====================

    async function handlePrivateMessage(msgPayload) {
        if (!msgPayload || typeof msgPayload !== 'object') return;
        const text = String(msgPayload.text || '').trim();
        const receiver = String(msgPayload.receiver || '').trim();
        const sender = socket.username;

        if (!text || !receiver || !sender) return;

        let dbId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        let timestamp = new Date();

        if (pool) {
            try {
                const queryPromise = pool.query(
                    'INSERT INTO messages (text, socket_id, username, receiver) VALUES ($1, $2, $3, $4) RETURNING id, timestamp',
                    [text, socket.id, sender, receiver]
                );
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB insert timeout")), 3000));
                const res = await Promise.race([queryPromise, timeoutPromise]);
                dbId = res.rows[0].id;
                timestamp = new Date(res.rows[0].timestamp);
            } catch (err) {
                console.error("Error saving private message to DB:", err.message);
            }
        }

        const messageData = {
            id: dbId,
            socket_id: socket.id,
            username: sender,
            receiver: receiver,
            text: text,
            time: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        memoryMessages.push(messageData);
        if (memoryMessages.length > 200) memoryMessages.shift();

        // 1. Emit to sender's own socket(s) for UI confirmation
        const senderSockets = userSockets.get(sender.toLowerCase());
        if (senderSockets && senderSockets.size > 0) {
            senderSockets.forEach(sId => io.to(sId).emit('private message', messageData));
        } else {
            socket.emit('private message', messageData);
        }

        // 2. Emit strictly to intended receiver's socket(s)
        const receiverSockets = userSockets.get(receiver.toLowerCase());
        if (receiverSockets && receiverSockets.size > 0) {
            receiverSockets.forEach(sId => io.to(sId).emit('private message', messageData));
        }
    }

    socket.on('private message', handlePrivateMessage);
    socket.on('chat message', handlePrivateMessage);

    // Delete message
    socket.on('delete message', async (msgId) => {
        if (pool && !String(msgId).startsWith('temp-')) {
            try {
                const queryPromise = pool.query('DELETE FROM messages WHERE id = $1', [msgId]);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB delete timeout")), 3000));
                await Promise.race([queryPromise, timeoutPromise]);
            } catch (err) {
                console.error("Error deleting message from DB:", err.message);
            }
        }
        const memIdx = memoryMessages.findIndex(m => m.id == msgId);
        if (memIdx !== -1) memoryMessages.splice(memIdx, 1);

        io.emit('message deleted', msgId);
    });

    // ==================== WEBRTC SIGNALING RELAYS ====================

    socket.on('call-user', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('call-made', {
            offer: data.offer,
            socket: socket.id,
            fromUsername: socket.username || data.fromUsername || 'Anonymous',
            isVideo: data.isVideo !== false
        });
    });

    socket.on('make-answer', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('answer-made', {
            socket: socket.id,
            answer: data.answer
        });
    });

    socket.on('ice-candidate', (data) => {
        if (!data || !data.to || !data.candidate) return;
        io.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    socket.on('reject-call', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('call-rejected', {
            from: socket.id,
            fromUsername: socket.username,
            reason: data.reason || 'declined'
        });
    });

    socket.on('end-call', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('call-ended', {
            from: socket.id
        });
    });

    socket.on('disconnect', async () => {
        const disconnectedUsername = removeUserSocket(socket.id);
        console.log(`User disconnected: ${disconnectedUsername || 'Anonymous'} (${socket.id})`);
        if (disconnectedUsername) {
            await notifyAllFriendsOfStatusChange(disconnectedUsername);
        }
        socket.broadcast.emit('user-disconnected', { socketId: socket.id });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
