const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messagesContainer = document.getElementById('messages');
const statusIndicator = document.getElementById('status-indicator');

let currentSocketId = null;

socket.on('connect', () => {
    statusIndicator.classList.remove('disconnected');
    currentSocketId = socket.id;
});

socket.on('disconnect', () => {
    statusIndicator.classList.add('disconnected');
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        socket.emit('chat message', input.value);
        input.value = '';
        input.focus();
    }
});

function appendMessage(data) {
    const isOwnMessage = data.socket_id === currentSocketId;
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isOwnMessage ? 'own' : 'other');
    messageElement.id = `msg-${data.id}`;
    
    const textElement = document.createElement('span');
    textElement.textContent = data.text;
    
    const timeElement = document.createElement('span');
    timeElement.classList.add('time');
    timeElement.textContent = data.time;
    
    messageElement.appendChild(textElement);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    `;
    deleteBtn.title = "Delete message";
    deleteBtn.addEventListener('click', () => {
        socket.emit('delete message', data.id);
    });
    
    messageElement.appendChild(deleteBtn);
    messageElement.appendChild(timeElement);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

socket.on('chat history', (history) => {
    // Clear initial system messages so they aren't duplicated unnecessarily
    messagesContainer.innerHTML = '';
    history.forEach(appendMessage);
});

socket.on('chat message', (data) => {
    appendMessage(data);
});

socket.on('message deleted', (msgId) => {
    const msgElement = document.getElementById(`msg-${msgId}`);
    if (msgElement) {
        msgElement.style.animation = "fadeOut 0.3s forwards";
        setTimeout(() => msgElement.remove(), 300);
    }
});
