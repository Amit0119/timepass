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

let pool;
try {
    if (process.env.DATABASE_URL) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });
        
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });

        pool.query(`
          CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            text TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            socket_id VARCHAR(255)
          )
        `).then(() => {
          console.log("Database table messages ensured.");
        }).catch(err => {
          console.error("Error creating table:", err);
        });
    } else {
        console.warn("DATABASE_URL is not set. Running in memory-only mode.");
    }
} catch (err) {
    console.error("Failed to initialize PostgreSQL pool:", err);
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    if (pool) {
        // Fetch and send last 50 messages
        try {
            const res = await pool.query('SELECT * FROM (SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50) AS recent ORDER BY timestamp ASC');
            const history = res.rows.map(row => ({
                id: row.id,
                socket_id: row.socket_id,
                text: row.text,
                time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));
            socket.emit('chat history', history);
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    }

    // Broadcast incoming messages
    socket.on('chat message', async (msg) => {
        let dbId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        let timestamp = new Date();
        
        if (pool) {
            try {
                const res = await pool.query(
                    'INSERT INTO messages (text, socket_id) VALUES ($1, $2) RETURNING id, timestamp',
                    [msg, socket.id]
                );
                const newMsg = res.rows[0];
                dbId = newMsg.id;
                timestamp = new Date(newMsg.timestamp);
            } catch (err) {
                console.error("Error saving message to DB (falling back to memory):", err);
            }
        } else {
            console.warn("Database not connected, broadcasting without persistence.");
        }
        
        // Critical: Always broadcast so the chat doesn't break if the DB fails
        const messageData = {
            id: dbId,
            socket_id: socket.id,
            text: msg,
            time: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.emit('chat message', messageData);
    });

    // Handle delete
    socket.on('delete message', async (msgId) => {
        if (pool && !String(msgId).startsWith('temp-')) {
            try {
                await pool.query('DELETE FROM messages WHERE id = $1', [msgId]);
            } catch (err) {
                console.error("Error deleting message from DB:", err);
            }
        }
        // Always broadcast delete so UI can sync, even if DB fails or it was a temp message
        io.emit('message deleted', msgId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
