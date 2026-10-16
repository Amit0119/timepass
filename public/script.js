// ==================== STATE VARIABLES ====================
let socket = null;
let currentUser = null;
let isLoginMode = true;

// WebRTC State
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

let peerConnection = null;
let localStream = null;
let currentPeerSocketId = null;
let currentPeerUsername = null;
let currentCallIsVideo = true;
let isAudioMuted = false;
let isVideoDisabled = false;
let iceCandidatesQueue = [];
let callTimerInterval = null;
let callStartTime = null;
let pendingIncomingCall = null;

// Friend System State
let currentFriendsData = {
    friends: [],
    incomingRequests: [],
    outgoingRequests: []
};
let activeSidebarTab = 'friends'; // 'friends' | 'requests' | 'find'
let searchDebounceTimeout = null;

// ==================== DOM ELEMENTS ====================

// Authentication
const authContainer = document.getElementById('auth-container');
const authForm = document.getElementById('auth-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const authFeedback = document.getElementById('auth-feedback');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authSwitchBtn = document.getElementById('auth-switch-btn');

// Chat & Header
let activeChatFriend = null;
const chatContainer = document.getElementById('chat-container');
const chatHeaderTitle = document.getElementById('chat-header-title');
const currentUserDisplay = document.getElementById('current-user-display');
const chatStatusText = document.getElementById('chat-status-text');
const statusIndicator = document.getElementById('status-indicator');
const logoutBtn = document.getElementById('logout-btn');
const messagesContainer = document.getElementById('messages');
const emptyChatState = document.getElementById('empty-chat-state');
const chatForm = document.getElementById('form');
const chatInput = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const usersSidebar = document.getElementById('users-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const toggleUsersBtn = document.getElementById('toggle-users-btn');
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
const requestsHeaderBadge = document.getElementById('requests-header-badge');

// Sidebar Tabs & Panes
const tabSidebarFriends = document.getElementById('tab-sidebar-friends');
const tabSidebarRequests = document.getElementById('tab-sidebar-requests');
const tabSidebarFind = document.getElementById('tab-sidebar-find');
const paneFriends = document.getElementById('pane-friends');
const paneRequests = document.getElementById('pane-requests');
const paneFind = document.getElementById('pane-find');
const friendsCountBadge = document.getElementById('friends-count-badge');
const requestsBadgeCount = document.getElementById('requests-badge-count');
const friendsList = document.getElementById('friends-list');
const requestsList = document.getElementById('requests-list');
const findUsersList = document.getElementById('find-users-list');
const findUsersInput = document.getElementById('find-users-input');
const gotoFindBtn = document.getElementById('goto-find-btn');

// WebRTC Calling Modals
const callModal = document.getElementById('call-modal');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callPeerName = document.getElementById('call-peer-name');
const callTypeIndicator = document.getElementById('call-type-indicator');
const callTimer = document.getElementById('call-timer');
const remoteAudioPlaceholder = document.getElementById('remote-audio-placeholder');
const remoteAvatarInitial = document.getElementById('remote-avatar-initial');
const localCamOffBadge = document.getElementById('local-cam-off-badge');
const micToggleBtn = document.getElementById('mic-toggle-btn');
const camToggleBtn = document.getElementById('cam-toggle-btn');
const endCallBtn = document.getElementById('end-call-btn');

// Incoming & Outgoing Call Overlays
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallerName = document.getElementById('incoming-caller-name');
const incomingCallerAvatar = document.getElementById('incoming-caller-avatar');
const incomingCallType = document.getElementById('incoming-call-type');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const outgoingCallOverlay = document.getElementById('outgoing-call-overlay');
const outgoingPeerName = document.getElementById('outgoing-peer-name');
const outgoingPeerAvatar = document.getElementById('outgoing-peer-avatar');
const outgoingCallType = document.getElementById('outgoing-call-type');
const cancelOutgoingCallBtn = document.getElementById('cancel-outgoing-call-btn');
const toastContainer = document.getElementById('toast-container');

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4000);
}

// ==================== PASSWORD EYE TOGGLE ====================

if (togglePasswordBtn && authPassword) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = authPassword.type === 'password';
        authPassword.type = isPassword ? 'text' : 'password';

        const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
        const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');

        if (eyeOpen && eyeClosed) {
            eyeOpen.style.display = isPassword ? 'none' : 'block';
            eyeClosed.style.display = isPassword ? 'block' : 'none';
        }
    });
}

// ==================== AUTHENTICATION UI LOGIC ====================

function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    hideFeedback();

    if (isLoginMode) {
        tabLogin.classList.add('active');
        tabLogin.setAttribute('aria-selected', 'true');
        tabRegister.classList.remove('active');
        tabRegister.setAttribute('aria-selected', 'false');

        authTitle.textContent = 'Welcome Back';
        authSubtitle.textContent = 'Sign in to connect and call your friends';
        authSubmitBtn.querySelector('span').textContent = 'Sign In';
        authSwitchText.textContent = "Don't have an account?";
        authSwitchBtn.textContent = 'Create one';
    } else {
        tabRegister.classList.add('active');
        tabRegister.setAttribute('aria-selected', 'true');
        tabLogin.classList.remove('active');
        tabLogin.setAttribute('aria-selected', 'false');

        authTitle.textContent = 'Create Account';
        authSubtitle.textContent = 'Register to start chatting with others';
        authSubmitBtn.querySelector('span').textContent = 'Register';
        authSwitchText.textContent = 'Already have an account?';
        authSwitchBtn.textContent = 'Sign in';
    }
}

tabLogin.addEventListener('click', () => setAuthMode(true));
tabRegister.addEventListener('click', () => setAuthMode(false));
authSwitchBtn.addEventListener('click', () => setAuthMode(!isLoginMode));

function showFeedback(message, type = 'error') {
    authFeedback.textContent = message;
    authFeedback.className = `auth-feedback ${type}`;
    authFeedback.style.display = 'block';
}

function hideFeedback() {
    authFeedback.style.display = 'none';
    authFeedback.textContent = '';
}

// Handle Login & Register Form Submission
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback();

    const username = authUsername.value.trim();
    const password = authPassword.value;

    if (!username || !password) {
        showFeedback('Please fill in both fields.', 'error');
        return;
    }

    if (password.length < 6) {
        showFeedback('Password must be at least 6 characters long.', 'error');
        return;
    }

    const endpoint = isLoginMode ? '/login' : '/register';
    const submitSpan = authSubmitBtn.querySelector('span');
    const originalText = submitSpan.textContent;

    authSubmitBtn.disabled = true;
    submitSpan.textContent = isLoginMode ? 'Signing In...' : 'Registering...';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showFeedback(data.error || 'Authentication failed. Please try again.', 'error');
            authSubmitBtn.disabled = false;
            submitSpan.textContent = originalText;
            return;
        }

        if (isLoginMode) {
            onLoginSuccess(data.username || username);
        } else {
            showFeedback('Account created successfully! Logging you in...', 'success');
            setTimeout(() => {
                onLoginSuccess(data.username || username);
            }, 600);
        }
    } catch (err) {
        console.error('Auth request error:', err);
        showFeedback('Network error. Is the server running?', 'error');
        authSubmitBtn.disabled = false;
        submitSpan.textContent = originalText;
    }
});

function onLoginSuccess(username) {
    currentUser = username;

    authSubmitBtn.disabled = false;
    authSubmitBtn.querySelector('span').textContent = isLoginMode ? 'Sign In' : 'Register';
    authPassword.value = '';
    hideFeedback();

    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    if (currentUserDisplay) {
        currentUserDisplay.textContent = username;
    }

    resetChatWindow();
    connectSocket(username);
}

// Drawer Controls for Mobile
function openMobileSidebar() {
    if (usersSidebar) usersSidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
}

function closeMobileSidebar() {
    if (usersSidebar) usersSidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
}

// Reset Chat Window to Empty / Disabled State
function resetChatWindow() {
    activeChatFriend = null;
    if (chatHeaderTitle) chatHeaderTitle.textContent = 'Live Chat';
    if (chatStatusText) chatStatusText.textContent = 'Select a friend to message';
    if (statusIndicator) statusIndicator.className = 'status-indicator';
    if (chatInput) {
        chatInput.value = '';
        chatInput.disabled = true;
        chatInput.placeholder = 'Select a friend to message...';
    }
    if (sendBtn) sendBtn.disabled = true;
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="empty-chat-state" id="empty-chat-state">
                <div class="empty-chat-icon">💬</div>
                <h3>Select a Friend</h3>
                <p>Choose an accepted friend from the sidebar to open your private conversation.</p>
            </div>
        `;
    }
}

// Logout handler
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        endCall(true);
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        currentUser = null;
        resetChatWindow();
        closeMobileSidebar();
        chatContainer.style.display = 'none';
        authContainer.style.display = 'flex';
        authUsername.focus();
    });
}

// Toggle collapsible sidebar (Desktop slide & Mobile drawer)
if (sidebarCollapseBtn && usersSidebar) {
    sidebarCollapseBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            if (usersSidebar.classList.contains('open')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        } else {
            const isCollapsed = usersSidebar.classList.toggle('collapsed');
            sidebarCollapseBtn.classList.toggle('sidebar-is-collapsed', isCollapsed);
        }
    });
}

// Toggle mobile sidebar via header button
if (toggleUsersBtn && usersSidebar) {
    toggleUsersBtn.addEventListener('click', () => {
        if (usersSidebar.classList.contains('open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    });
}

// Close mobile sidebar via backdrop click
if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
}

// Close mobile sidebar via close button (✕)
if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
}

// ==================== SIDEBAR TABS SWITCHING ====================

function switchSidebarTab(tabName) {
    activeSidebarTab = tabName;

    // Tabs
    tabSidebarFriends.classList.toggle('active', tabName === 'friends');
    tabSidebarRequests.classList.toggle('active', tabName === 'requests');
    tabSidebarFind.classList.toggle('active', tabName === 'find');

    // Panes
    paneFriends.style.display = tabName === 'friends' ? 'flex' : 'none';
    paneRequests.style.display = tabName === 'requests' ? 'flex' : 'none';
    paneFind.style.display = tabName === 'find' ? 'flex' : 'none';

    if (tabName === 'find') {
        performUserSearch(findUsersInput ? findUsersInput.value : '');
        if (findUsersInput) findUsersInput.focus();
    }
}

tabSidebarFriends.addEventListener('click', () => switchSidebarTab('friends'));
tabSidebarRequests.addEventListener('click', () => switchSidebarTab('requests'));
tabSidebarFind.addEventListener('click', () => switchSidebarTab('find'));
if (gotoFindBtn) {
    gotoFindBtn.addEventListener('click', () => switchSidebarTab('find'));
}

// ==================== REAL-TIME SOCKET.IO & FRIEND SYSTEM ====================

function connectSocket(username) {
    if (socket) {
        socket.disconnect();
    }

    socket = io({
        query: { username: username }
    });

    socket.on('connect', () => {
        console.log(`Socket connected as ${username} (${socket.id})`);
        if (statusIndicator) statusIndicator.classList.remove('disconnected');
        if (chatStatusText) chatStatusText.textContent = 'Connected';
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        if (statusIndicator) statusIndicator.classList.add('disconnected');
        if (chatStatusText) chatStatusText.textContent = 'Disconnected';
    });

    socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
        if (statusIndicator) statusIndicator.classList.add('disconnected');
        if (chatStatusText) chatStatusText.textContent = 'Disconnected';
        endCall(false);
    });

    // Real-Time Friends & Requests Data Update
    socket.on('friends-data-updated', (data) => {
        if (!data) return;
        currentFriendsData = data;
        renderFriendsList(data.friends);
        renderRequestsList(data.incomingRequests);
        updateBadges(data);

        // If currently on Find tab, refresh search results to update relations
        if (activeSidebarTab === 'find') {
            performUserSearch(findUsersInput ? findUsersInput.value : '');
        }
    });

    // 1-on-1 Chat History
    socket.on('chat history', (data) => {
        if (!messagesContainer || !data) return;
        const history = Array.isArray(data) ? data : (data.history || []);
        const friendName = data.friendUsername;

        // Ensure this history belongs to the currently active chat
        if (friendName && activeChatFriend && friendName.toLowerCase() !== activeChatFriend.toLowerCase()) {
            return;
        }

        messagesContainer.innerHTML = '';

        const systemMsg = document.createElement('div');
        systemMsg.classList.add('message', 'system-message');
        systemMsg.textContent = 'Welcome meri pyari moti';
        messagesContainer.appendChild(systemMsg);

        if (Array.isArray(history)) {
            history.forEach(appendMessage);
        }
    });

    // Handle 1-on-1 Private Messages
    function handleIncomingPrivateMessage(data) {
        if (!data) return;
        const sender = (data.username || '').toLowerCase();
        const receiver = (data.receiver || '').toLowerCase();
        const activeLower = activeChatFriend ? activeChatFriend.toLowerCase() : null;
        const selfLower = currentUser ? currentUser.toLowerCase() : null;

        const isCurrentChat = activeLower && (
            (sender === selfLower && receiver === activeLower) ||
            (sender === activeLower && receiver === selfLower)
        );

        if (isCurrentChat) {
            const emptyState = document.getElementById('empty-chat-state');
            if (emptyState) emptyState.remove();
            appendMessage(data);
        } else if (sender !== selfLower) {
            const preview = data.text && data.text.length > 28 ? data.text.substring(0, 28) + '...' : (data.text || '');
            showToast(`💬 ${data.username}: ${preview}`);
        }
    }

    socket.on('private message', handleIncomingPrivateMessage);
    socket.on('chat message', handleIncomingPrivateMessage);

    // Delete Message
    socket.on('message deleted', (msgId) => {
        const msgElement = document.getElementById(`msg-${msgId}`);
        if (msgElement) {
            msgElement.style.animation = 'fadeOut 0.25s forwards';
            setTimeout(() => {
                if (msgElement.parentElement) msgElement.remove();
            }, 250);
        }
    });

    // ==================== WEBRTC SIGNALING LISTENERS ====================

    // Incoming Call: 'call-made'
    socket.on('call-made', (data) => {
        console.log('Incoming call from:', data.fromUsername, data);

        if (peerConnection || localStream) {
            socket.emit('reject-call', { to: data.socket, reason: 'busy' });
            return;
        }

        pendingIncomingCall = data;
        incomingCallerName.textContent = `${data.fromUsername} is calling...`;
        incomingCallerAvatar.textContent = data.fromUsername.charAt(0).toUpperCase();
        incomingCallType.textContent = data.isVideo ? '📹 Video Call' : '📞 Voice Call';
        incomingCallOverlay.style.display = 'flex';
    });

    // Answer Received: 'answer-made'
    socket.on('answer-made', async (data) => {
        console.log('Received answer from peer:', data);
        outgoingCallOverlay.style.display = 'none';

        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                drainIceCandidatesQueue();
                startCallTimer();
            } catch (err) {
                console.error('Error setting remote description from answer:', err);
            }
        }
    });

    // ICE Candidate Received: 'ice-candidate'
    socket.on('ice-candidate', async (data) => {
        if (data.candidate) {
            if (peerConnection && peerConnection.remoteDescription) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (err) {
                    console.warn('Error adding ICE candidate:', err);
                }
            } else {
                iceCandidatesQueue.push(data.candidate);
            }
        }
    });

    // Call Rejected by Peer: 'call-rejected'
    socket.on('call-rejected', (data) => {
        const reasonText = data.reason === 'busy' ? 'is on another call' : 'declined the call';
        showToast(`${data.fromUsername || 'User'} ${reasonText}`);
        outgoingCallOverlay.style.display = 'none';
        endCall(false);
    });

    // Call Ended by Peer: 'call-ended'
    socket.on('call-ended', () => {
        showToast(`${currentPeerUsername || 'Friend'} ended the call`);
        endCall(false);
    });

    // Peer disconnected
    socket.on('user-disconnected', (data) => {
        if (data.socketId === currentPeerSocketId) {
            showToast(`${currentPeerUsername || 'Friend'} disconnected`);
            endCall(false);
        }
    });
}

// Update Badges & Counters
function updateBadges(data) {
    const friendsCount = data.friends ? data.friends.length : 0;
    const reqCount = data.incomingRequests ? data.incomingRequests.length : 0;

    if (friendsCountBadge) friendsCountBadge.textContent = friendsCount;

    if (requestsBadgeCount) {
        requestsBadgeCount.textContent = reqCount;
        requestsBadgeCount.style.display = reqCount > 0 ? 'inline-block' : 'none';
    }

    if (requestsHeaderBadge) {
        requestsHeaderBadge.textContent = reqCount;
        requestsHeaderBadge.style.display = reqCount > 0 ? 'inline-block' : 'none';
    }
}

// ==================== RENDERING TABS ====================

// Render Accepted Friends List
function renderFriendsList(friends) {
    if (!friendsList) return;
    friendsList.innerHTML = '';

    if (!friends || friends.length === 0) {
        friendsList.innerHTML = `
            <div class="sidebar-empty-state">
                <p>No friends added yet.</p>
                <button type="button" class="empty-action-btn" onclick="switchSidebarTab('find')">Find & Add Users</button>
            </div>
        `;
        return;
    }

    // Sort online friends first
    const sortedFriends = [...friends].sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));

    sortedFriends.forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.dataset.username = friend.username;

        // If this friend is currently open in chat, highlight and update status
        if (activeChatFriend && activeChatFriend.toLowerCase() === friend.username.toLowerCase()) {
            item.classList.add('active-chat-friend');
            if (chatStatusText) chatStatusText.textContent = friend.isOnline ? 'Online' : 'Offline';
            if (statusIndicator) statusIndicator.className = `status-indicator ${friend.isOnline ? '' : 'disconnected'}`;
        }

        const info = document.createElement('div');
        info.className = 'friend-info';

        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar-initial';
        avatar.textContent = friend.username.charAt(0).toUpperCase();

        const statusDot = document.createElement('span');
        statusDot.className = `status-dot ${friend.isOnline ? 'online' : 'offline'}`;

        avatarWrapper.appendChild(avatar);
        avatarWrapper.appendChild(statusDot);

        const details = document.createElement('div');
        details.className = 'friend-details';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'friend-name';
        nameSpan.textContent = friend.username;

        const statusLabel = document.createElement('span');
        statusLabel.className = `friend-status-label ${friend.isOnline ? 'online-text' : ''}`;
        statusLabel.textContent = friend.isOnline ? 'Online' : 'Offline';

        details.appendChild(nameSpan);
        details.appendChild(statusLabel);

        info.appendChild(avatarWrapper);
        info.appendChild(details);

        // Call Actions (Voice 📞 & Video 📹)
        const actions = document.createElement('div');
        actions.className = 'friend-call-actions';

        const voiceBtn = document.createElement('button');
        voiceBtn.className = `call-action-btn voice-btn ${!friend.isOnline ? 'disabled-call-btn' : ''}`;
        voiceBtn.textContent = '📞';
        voiceBtn.title = friend.isOnline ? `Voice call ${friend.username}` : `${friend.username} is offline`;
        voiceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (friend.isOnline && friend.socketId) {
                initiateCall(friend.socketId, friend.username, false);
            } else {
                showToast(`${friend.username} is currently offline.`);
            }
        });

        const videoBtn = document.createElement('button');
        videoBtn.className = `call-action-btn video-btn ${!friend.isOnline ? 'disabled-call-btn' : ''}`;
        videoBtn.textContent = '📹';
        videoBtn.title = friend.isOnline ? `Video call ${friend.username}` : `${friend.username} is offline`;
        videoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (friend.isOnline && friend.socketId) {
                initiateCall(friend.socketId, friend.username, true);
            } else {
                showToast(`${friend.username} is currently offline.`);
            }
        });

        actions.appendChild(voiceBtn);
        actions.appendChild(videoBtn);

        item.appendChild(info);
        item.appendChild(actions);

        // Clicking the friend opens their private 1-on-1 chat
        item.addEventListener('click', (e) => {
            if (e.target.closest('.call-action-btn')) return;
            selectFriendForChat(friend);
        });

        friendsList.appendChild(item);
    });
}

// Select a Friend to Open 1-on-1 Chat
function selectFriendForChat(friend) {
    if (!friend || !friend.username) return;
    activeChatFriend = friend.username;

    // Update active highlight in friends list
    const allFriendItems = document.querySelectorAll('.friend-item');
    allFriendItems.forEach(el => {
        if (el.dataset.username && el.dataset.username.toLowerCase() === friend.username.toLowerCase()) {
            el.classList.add('active-chat-friend');
        } else {
            el.classList.remove('active-chat-friend');
        }
    });

    // Update Chat Header
    if (chatHeaderTitle) {
        chatHeaderTitle.textContent = `Chatting with ${friend.username}`;
    }
    if (chatStatusText) {
        chatStatusText.textContent = friend.isOnline ? 'Online' : 'Offline';
    }
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${friend.isOnline ? '' : 'disconnected'}`;
    }

    // Enable chat input & send button
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = `Message ${friend.username}...`;
    }
    if (sendBtn) {
        sendBtn.disabled = false;
    }

    // Clear messages and set initial system greeting
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        const systemMsg = document.createElement('div');
        systemMsg.classList.add('message', 'system-message');
        systemMsg.textContent = 'Welcome meri pyari moti';
        messagesContainer.appendChild(systemMsg);
    }

    // Request 1-on-1 history from server
    if (socket) {
        socket.emit('get-chat-history', { friendUsername: friend.username });
    }

    // Close mobile drawer if open
    closeMobileSidebar();

    if (chatInput) {
        chatInput.focus();
    }
}

// Render Incoming Friend Requests
function renderRequestsList(requests) {
    if (!requestsList) return;
    requestsList.innerHTML = '';

    if (!requests || requests.length === 0) {
        requestsList.innerHTML = `
            <div class="sidebar-empty-state">
                <p>No pending friend requests.</p>
            </div>
        `;
        return;
    }

    requests.forEach(req => {
        const item = document.createElement('div');
        item.className = 'request-item';

        const info = document.createElement('div');
        info.className = 'friend-info';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar-initial';
        avatar.textContent = req.fromUsername.charAt(0).toUpperCase();

        const details = document.createElement('div');
        details.className = 'friend-details';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'friend-name';
        nameSpan.textContent = req.fromUsername;

        const subSpan = document.createElement('span');
        subSpan.className = 'friend-status-label';
        subSpan.textContent = 'Wants to be friends';

        details.appendChild(nameSpan);
        details.appendChild(subSpan);

        info.appendChild(avatar);
        info.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'req-actions';

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'req-btn accept';
        acceptBtn.title = 'Accept Request';
        acceptBtn.textContent = '✅';
        acceptBtn.addEventListener('click', () => {
            respondFriendRequest(req.id, 'accept');
        });

        const declineBtn = document.createElement('button');
        declineBtn.className = 'req-btn decline';
        declineBtn.title = 'Decline Request';
        declineBtn.textContent = '❌';
        declineBtn.addEventListener('click', () => {
            respondFriendRequest(req.id, 'decline');
        });

        actions.appendChild(acceptBtn);
        actions.appendChild(declineBtn);

        item.appendChild(info);
        item.appendChild(actions);

        requestsList.appendChild(item);
    });
}

// Search and Find Users
if (findUsersInput) {
    findUsersInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            performUserSearch(e.target.value);
        }, 250);
    });
}

function performUserSearch(query) {
    if (!socket || !currentUser) return;

    socket.emit('search-users', { query: query.trim() }, (response) => {
        if (response && response.success) {
            renderFindUsersList(response.results);
        }
    });
}

function renderFindUsersList(users) {
    if (!findUsersList) return;
    findUsersList.innerHTML = '';

    if (!users || users.length === 0) {
        findUsersList.innerHTML = `
            <div class="sidebar-empty-state">
                <p>No registered users found.</p>
            </div>
        `;
        return;
    }

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'find-user-item';

        const info = document.createElement('div');
        info.className = 'friend-info';

        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar-initial';
        avatar.textContent = user.username.charAt(0).toUpperCase();

        const dot = document.createElement('span');
        dot.className = `status-dot ${user.isOnline ? 'online' : 'offline'}`;

        avatarWrapper.appendChild(avatar);
        avatarWrapper.appendChild(dot);

        const details = document.createElement('div');
        details.className = 'friend-details';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'friend-name';
        nameSpan.textContent = user.username;

        const sub = document.createElement('span');
        sub.className = `friend-status-label ${user.isOnline ? 'online-text' : ''}`;
        sub.textContent = user.isOnline ? 'Online' : 'Offline';

        details.appendChild(nameSpan);
        details.appendChild(sub);

        info.appendChild(avatarWrapper);
        info.appendChild(details);

        const actionArea = document.createElement('div');

        if (user.relation === 'friends') {
            const pill = document.createElement('span');
            pill.className = 'relation-pill friends';
            pill.textContent = '✓ Friends';
            actionArea.appendChild(pill);
        } else if (user.relation === 'requested') {
            const pill = document.createElement('span');
            pill.className = 'relation-pill requested';
            pill.textContent = '⏳ Requested';
            actionArea.appendChild(pill);
        } else if (user.relation === 'pending_received') {
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'add-friend-btn';
            acceptBtn.textContent = '✅ Accept';
            acceptBtn.addEventListener('click', () => {
                respondFriendRequest(user.requestId, 'accept');
            });
            actionArea.appendChild(acceptBtn);
        } else {
            // 'none' -> can send friend request
            const addBtn = document.createElement('button');
            addBtn.className = 'add-friend-btn';
            addBtn.textContent = '➕ Add';
            addBtn.addEventListener('click', () => {
                addBtn.disabled = true;
                addBtn.textContent = 'Sending...';
                sendFriendRequest(user.username, addBtn);
            });
            actionArea.appendChild(addBtn);
        }

        item.appendChild(info);
        item.appendChild(actionArea);

        findUsersList.appendChild(item);
    });
}

// Send Friend Request
function sendFriendRequest(targetUsername, btnElement) {
    if (!socket) return;
    socket.emit('send-friend-request', { toUsername: targetUsername }, (res) => {
        if (res && res.success) {
            showToast(res.message || `Friend request sent to ${targetUsername}!`);
            if (btnElement) {
                btnElement.textContent = '⏳ Requested';
                btnElement.className = 'relation-pill requested';
            }
        } else {
            showToast(res.error || 'Failed to send request.');
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.textContent = '➕ Add';
            }
        }
    });
}

// Respond to Friend Request
function respondFriendRequest(requestId, action) {
    if (!socket) return;
    socket.emit('respond-friend-request', { requestId, action }, (res) => {
        if (res && res.success) {
            showToast(res.message);
        } else {
            showToast(res.error || 'Failed to update request.');
        }
    });
}

// ==================== CHAT MESSAGING ====================

// Send Message Handler (Strictly 1-on-1 Private Messaging)
if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        if (!activeChatFriend) {
            showToast('Please select an accepted friend to chat with.');
            return;
        }

        if (socket && currentUser) {
            socket.emit('private message', {
                text: text,
                receiver: activeChatFriend,
                username: currentUser
            });
            chatInput.value = '';
            chatInput.focus();
        }
    });
}

// Render Chat Message Bubble
function appendMessage(data) {
    if (!messagesContainer || !data) return;

    const senderUsername = data.username || 'Anonymous';
    const isOwnMessage = currentUser && senderUsername.toLowerCase() === currentUser.toLowerCase();

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isOwnMessage ? 'own' : 'other');
    messageElement.id = `msg-${data.id}`;

    // Sender Name
    const senderElement = document.createElement('span');
    senderElement.classList.add('sender-name');
    senderElement.textContent = isOwnMessage ? 'You' : senderUsername;
    messageElement.appendChild(senderElement);

    // Text
    const textElement = document.createElement('span');
    textElement.classList.add('message-text');
    textElement.textContent = data.text;
    messageElement.appendChild(textElement);

    // Footer
    const footerElement = document.createElement('div');
    footerElement.classList.add('message-footer');

    if (isOwnMessage) {
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('delete-btn');
        deleteBtn.title = 'Delete message';
        deleteBtn.setAttribute('aria-label', 'Delete message');
        deleteBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.addEventListener('click', () => {
            if (socket) socket.emit('delete message', data.id);
        });
        footerElement.appendChild(deleteBtn);
    }

    const timeElement = document.createElement('span');
    timeElement.classList.add('time');
    timeElement.textContent = data.time || '';
    footerElement.appendChild(timeElement);

    messageElement.appendChild(footerElement);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== WEBRTC CALLING ENGINE ====================

// Initiate Call (Only for friends)
async function initiateCall(targetSocketId, targetUsername, isVideo) {
    if (!socket) return;
    if (peerConnection || localStream) {
        showToast('You are already in a call.');
        return;
    }

    currentPeerSocketId = targetSocketId;
    currentPeerUsername = targetUsername;
    currentCallIsVideo = isVideo;

    outgoingPeerName.textContent = `Calling ${targetUsername}...`;
    outgoingPeerAvatar.textContent = targetUsername.charAt(0).toUpperCase();
    outgoingCallType.textContent = isVideo ? '📹 Video Call • Ringing...' : '📞 Voice Call • Ringing...';
    outgoingCallOverlay.style.display = 'flex';

    try {
        const constraints = {
            audio: true,
            video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        createPeerConnection();

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('call-user', {
            to: targetSocketId,
            offer: offer,
            isVideo: isVideo,
            fromUsername: currentUser
        });

        setupCallUI(targetUsername, isVideo);

    } catch (err) {
        console.error('Failed to get media devices or create offer:', err);
        showToast(`Camera/Microphone error: ${err.message || 'Permission denied'}`);
        outgoingCallOverlay.style.display = 'none';
        endCall(false);
    }
}

// Accept Incoming Call
acceptCallBtn.addEventListener('click', async () => {
    if (!pendingIncomingCall || !socket) return;

    const { offer, socket: callerSocketId, fromUsername, isVideo } = pendingIncomingCall;
    incomingCallOverlay.style.display = 'none';

    currentPeerSocketId = callerSocketId;
    currentPeerUsername = fromUsername;
    currentCallIsVideo = isVideo;

    try {
        const constraints = {
            audio: true,
            video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        createPeerConnection();

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        drainIceCandidatesQueue();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('make-answer', {
            to: callerSocketId,
            answer: answer
        });

        setupCallUI(fromUsername, isVideo);
        startCallTimer();

    } catch (err) {
        console.error('Error accepting call:', err);
        showToast(`Error accessing devices: ${err.message}`);
        socket.emit('reject-call', { to: callerSocketId, reason: 'error' });
        endCall(false);
    } finally {
        pendingIncomingCall = null;
    }
});

// Decline Incoming Call
declineCallBtn.addEventListener('click', () => {
    if (pendingIncomingCall && socket) {
        socket.emit('reject-call', {
            to: pendingIncomingCall.socket,
            reason: 'declined'
        });
    }
    incomingCallOverlay.style.display = 'none';
    pendingIncomingCall = null;
});

// Cancel Outgoing Call
cancelOutgoingCallBtn.addEventListener('click', () => {
    if (currentPeerSocketId && socket) {
        socket.emit('end-call', { to: currentPeerSocketId });
    }
    outgoingCallOverlay.style.display = 'none';
    endCall(false);
});

// Create and Configure RTCPeerConnection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentPeerSocketId && socket) {
            socket.emit('ice-candidate', {
                to: currentPeerSocketId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteAudioPlaceholder.style.display = 'none';
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            showToast('Call connection lost');
            endCall(false);
        }
    };
}

async function drainIceCandidatesQueue() {
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('Error applying buffered candidate:', e);
        }
    }
}

function setupCallUI(peerName, isVideo) {
    callPeerName.textContent = peerName;
    callTypeIndicator.textContent = isVideo ? '📹' : '📞';
    remoteAvatarInitial.textContent = peerName.charAt(0).toUpperCase();

    isAudioMuted = false;
    isVideoDisabled = false;
    micToggleBtn.classList.remove('active-muted');
    camToggleBtn.classList.remove('active-muted');
    localCamOffBadge.style.display = 'none';

    if (!isVideo) {
        remoteAudioPlaceholder.style.display = 'flex';
        localVideo.style.display = 'none';
        camToggleBtn.style.display = 'none';
    } else {
        remoteAudioPlaceholder.style.display = 'none';
        localVideo.style.display = 'block';
        camToggleBtn.style.display = 'flex';
    }

    callModal.style.display = 'flex';
}

micToggleBtn.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isAudioMuted = !isAudioMuted;
        audioTrack.enabled = !isAudioMuted;
        micToggleBtn.classList.toggle('active-muted', isAudioMuted);
        showToast(isAudioMuted ? 'Microphone muted' : 'Microphone unmuted');
    }
});

camToggleBtn.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isVideoDisabled = !isVideoDisabled;
        videoTrack.enabled = !isVideoDisabled;
        camToggleBtn.classList.toggle('active-muted', isVideoDisabled);
        localCamOffBadge.style.display = isVideoDisabled ? 'flex' : 'none';
        showToast(isVideoDisabled ? 'Camera turned off' : 'Camera turned on');
    }
});

endCallBtn.addEventListener('click', () => {
    endCall(true);
});

function endCall(notifyPeer = true) {
    if (notifyPeer && socket && currentPeerSocketId) {
        socket.emit('end-call', { to: currentPeerSocketId });
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    iceCandidatesQueue = [];
    currentPeerSocketId = null;
    currentPeerUsername = null;
    stopCallTimer();

    callModal.style.display = 'none';
    incomingCallOverlay.style.display = 'none';
    outgoingCallOverlay.style.display = 'none';
}

function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    callTimer.textContent = '00:00';
    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callTimer.textContent = '00:00';
}
