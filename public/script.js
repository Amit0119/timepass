const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const statusIndicator = document.getElementById('status-indicator');

// Handle connection status UI
socket.on('connect', () => {
    statusIndicator.classList.remove('disconnected');
});

socket.on('disconnect', () => {
    statusIndicator.classList.add('disconnected');
});

// Handle form submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        socket.emit('chat message', input.value);
        input.value = '';
        input.focus();
    }
});

// Handle incoming messages
socket.on('chat message', (data) => {
    const isOwnMessage = data.id === socket.id;
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isOwnMessage ? 'own' : 'other');
    
    const textElement = document.createElement('span');
    textElement.textContent = data.text;
    
    const timeElement = document.createElement('span');
    timeElement.classList.add('time');
    timeElement.textContent = data.time;
    
    messageElement.appendChild(textElement);
    messageElement.appendChild(timeElement);
    
    messagesContainer.appendChild(messageElement);
    
    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});
