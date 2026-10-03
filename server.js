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
        if (!pool) {
            console.error("Database not connected, cannot save message.");
            return; 
        }
        
        try {
            const res = await pool.query(
                'INSERT INTO messages (text, socket_id) VALUES ($1, $2) RETURNING id, timestamp',
                [msg, socket.id]
            );
            const newMsg = res.rows[0];
            const messageData = {
                id: newMsg.id,
                socket_id: socket.id,
                text: msg,
                time: new Date(newMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            io.emit('chat message', messageData);
        } catch (err) {
            console.error("Error saving message:", err);
        }
    });

    // Handle delete
    socket.on('delete message', async (msgId) => {
        if (!pool) return;
        try {
            await pool.query('DELETE FROM messages WHERE id = $1', [msgId]);
            io.emit('message deleted', msgId);
        } catch (err) {
            console.error("Error deleting message:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
