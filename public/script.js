let socket = null;
let currentUser = null;
let activeFriend = null;
let socialState = { friends: [], requests: [], discover: [] };

// UX & Notification State
let unreadCounts = {};
let originalDocumentTitle = document.title || 'Private Space 💜';
let titleBlinkInterval = null;
let notifBannerTimeout = null;
let audioCtx = null;
let currentAudioRoute = 'speaker'; // 'speaker' | 'earpiece'
let callToastTimeout = null;

// Notification Sound Toggle: CRITICAL - MUST be set to OFF by default (initial state)
const storedSoundPref = localStorage.getItem('sound_notifications_enabled');
let soundNotificationsEnabled = storedSoundPref === 'true'; // strictly false by default

// WebRTC State
let peerConnection = null;
let localStream = null;
let currentCallPartner = null;
let incomingOfferData = null;
let isCurrentCallVideo = true;
let iceCandidateQueue = [];
let callTimerInterval = null;
let callSeconds = 0;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements - Auth
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const eyeOpen = document.getElementById('eye-open');
const eyeClosed = document.getElementById('eye-closed');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authFeedback = document.getElementById('auth-feedback');

// DOM Elements - Main Layout & Sidebar
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const emptyOpenMenuBtn = document.getElementById('empty-open-menu-btn');
const myAvatar = document.getElementById('my-avatar');
const myUsername = document.getElementById('my-username');
const logoutBtn = document.getElementById('logout-btn');

const sideTabs = document.querySelectorAll('.side-tab');
const badgeFriends = document.getElementById('badge-friends');
const badgeRequests = document.getElementById('badge-requests');
const mobileReqDot = document.getElementById('mobile-req-dot');
const friendsListEl = document.getElementById('friends-list');
const requestsListEl = document.getElementById('requests-list');
const findListEl = document.getElementById('find-list');

// DOM Elements - Chat Area
const headerAvatar = document.getElementById('header-avatar');
const headerTitle = document.getElementById('header-title');
const headerSubtitle = document.getElementById('header-subtitle');
const headerCallActions = document.getElementById('header-call-actions');
const headerVoiceBtn = document.getElementById('header-voice-btn');
const headerVideoBtn = document.getElementById('header-video-btn');
const emptyChatState = document.getElementById('empty-chat-state');
const messagesList = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// DOM Elements - Calling
const incomingOverlay = document.getElementById('incoming-call-overlay');
const incomingCallerAvatar = document.getElementById('incoming-caller-avatar');
const incomingCallerName = document.getElementById('incoming-caller-name');
const incomingCallType = document.getElementById('incoming-call-type');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const outgoingOverlay = document.getElementById('outgoing-call-overlay');
const outgoingCalleeAvatar = document.getElementById('outgoing-callee-avatar');
const outgoingCalleeName = document.getElementById('outgoing-callee-name');
const cancelCallBtn = document.getElementById('cancel-call-btn');

const callModal = document.getElementById('call-modal');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const localVideoWrap = document.getElementById('local-video-wrap');
const audioPlaceholder = document.getElementById('audio-call-placeholder');
const activeCallAvatar = document.getElementById('active-call-avatar');
const activeCallUsername = document.getElementById('active-call-username');
const callTimerEl = document.getElementById('call-timer');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleAudioRouteBtn = document.getElementById('toggle-audio-route-btn');
const endCallBtn = document.getElementById('end-call-btn');
const callToast = document.getElementById('call-toast');
const callToastIcon = document.getElementById('call-toast-icon');
const callToastText = document.getElementById('call-toast-text');

// DOM Elements - In-App Notification Banner
const notifBanner = document.getElementById('msg-notification-banner');
const notifAvatar = document.getElementById('notif-avatar');
const notifSender = document.getElementById('notif-sender');
const notifText = document.getElementById('notif-text');
const notifCloseBtn = document.getElementById('notif-close-btn');

// DOM Elements - Settings Modal & Notification Toggle
const settingsBtn = document.getElementById('settings-btn');
const headerSettingsBtn = document.getElementById('header-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const toggleSoundNotifications = document.getElementById('toggle-sound-notifications');

let authMode = 'login';

// ================= AUTHENTICATION UI =================

tabLogin.addEventListener('click', () => {
  authMode = 'login';
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  authSubmitBtn.textContent = 'Sign In';
  hideFeedback();
});

tabRegister.addEventListener('click', () => {
  authMode = 'register';
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  authSubmitBtn.textContent = 'Create Account';
  hideFeedback();
});

togglePasswordBtn.addEventListener('click', () => {
  const isPass = authPassword.type === 'password';
  authPassword.type = isPass ? 'text' : 'password';
  eyeOpen.style.display = isPass ? 'none' : 'block';
  eyeClosed.style.display = isPass ? 'block' : 'none';
});

function showFeedback(msg) {
  authFeedback.textContent = msg;
  authFeedback.className = 'auth-feedback error';
  authFeedback.style.display = 'block';
}

function hideFeedback() {
  authFeedback.style.display = 'none';
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFeedback();

  const username = authUsername.value.trim();
  const password = authPassword.value;

  const endpoint = authMode === 'login' ? '/login' : '/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Authentication failed');
      return;
    }
    enterApp(data.username);
  } catch (err) {
    showFeedback('Network error. Please try again.');
  }
});

function enterApp(username) {
  currentUser = username;
  myUsername.textContent = username;
  myAvatar.textContent = username.charAt(0).toUpperCase();

  authContainer.style.display = 'none';
  chatContainer.style.display = 'flex';

  connectSocket();
}

logoutBtn.addEventListener('click', () => {
  if (socket) socket.disconnect();
  currentUser = null;
  activeFriend = null;
  unreadCounts = {};
  resetTitleAlert();
  dismissNotificationBanner();
  closeSettingsModal();
  messagesList.innerHTML = '';
  chatContainer.style.display = 'none';
  authContainer.style.display = 'flex';
  authPassword.value = '';
});

// ================= SIDEBAR & RESPONSIVE DRAWER =================

function openMobileSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.add('open-mobile');
    sidebarBackdrop.classList.add('active');
  } else {
    sidebar.classList.toggle('collapsed-desktop');
  }
}

function closeMobileSidebar() {
  sidebar.classList.remove('open-mobile');
  sidebarBackdrop.classList.remove('active');
}

toggleSidebarBtn.addEventListener('click', openMobileSidebar);
emptyOpenMenuBtn.addEventListener('click', openMobileSidebar);
closeSidebarBtn.addEventListener('click', closeMobileSidebar);
sidebarBackdrop.addEventListener('click', closeMobileSidebar);

sideTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    sideTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ================= SOCKET.IO & SOCIAL LISTS =================

function connectSocket() {
  socket = io({ query: { username: currentUser } });

  socket.on('social-data', (data) => {
    socialState = data;
    renderSocialLists();

    // Auto-select friend if only 1 friend exists and none selected yet
    if (!activeFriend && data.friends.length === 1) {
      selectFriend(data.friends[0].username);
    } else if (activeFriend) {
      updateActiveFriendHeader();
    }
  });

  socket.on('private-chat-history', ({ friend, messages }) => {
    if (!activeFriend || (friend || '').toLowerCase() !== activeFriend.toLowerCase()) return;
    messagesList.innerHTML = '';
    (messages || []).forEach(msg => appendMessage(msg));
    scrollToBottom();
  });

  socket.on('private-message', (msg) => {
    if (!currentUser || !msg) return;
    const sender = (msg.username || '').toLowerCase();
    const recipient = (msg.recipient || '').toLowerCase();
    const me = currentUser.toLowerCase();

    // 1. Private message received from a friend
    if (recipient === me && sender !== me) {
      if (soundNotificationsEnabled) {
        playNotificationSound();
      }

      const isChatOpenWithSender = activeFriend && activeFriend.toLowerCase() === sender;
      if (isChatOpenWithSender) {
        appendMessage(msg);
        scrollToBottom();
        if (document.hidden || !document.hasFocus()) {
          triggerTitleAlert(msg.username);
        }
      } else {
        // Message arrived while in another chat or sidebar
        unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
        renderSocialLists();
        showNotificationBanner(msg.username, msg.text);
        triggerTitleAlert(msg.username);
      }
    } else if (sender === me) {
      // 2. Sent message confirmed by server
      if (activeFriend && recipient === activeFriend.toLowerCase()) {
        appendMessage(msg);
        scrollToBottom();
      }
    }
  });

  socket.on('message-deleted', (id) => {
    const el = document.querySelector(`.msg-row[data-id="${id}"]`);
    if (el) el.remove();
  });

  // WebRTC Signaling Listeners
  socket.on('incoming-call', handleIncomingCall);
  socket.on('call-answered', handleCallAnswered);
  socket.on('ice-candidate', handleNewIceCandidate);
  socket.on('call-rejected', () => {
    cleanupCallUI();
    alert('Call was declined.');
  });
  socket.on('call-ended', () => {
    cleanupCallUI();
  });
  socket.on('call-error', ({ message }) => {
    cleanupCallUI();
    alert(message);
  });
}

function renderSocialLists() {
  const { friends, requests, discover } = socialState;

  const totalUnreads = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  if (totalUnreads > 0) {
    badgeFriends.textContent = `${friends.length} (${totalUnreads})`;
    badgeFriends.classList.add('alert');
  } else {
    badgeFriends.textContent = friends.length;
    badgeFriends.classList.remove('alert');
  }

  if (requests.length > 0) {
    badgeRequests.style.display = 'inline-block';
    badgeRequests.textContent = requests.length;
    mobileReqDot.style.display = 'block';
  } else {
    badgeRequests.style.display = 'none';
    mobileReqDot.style.display = 'none';
  }

  // 1. Friends Tab
  friendsListEl.innerHTML = '';
  if (friends.length === 0) {
    friendsListEl.innerHTML = `<div class="empty-list-msg">No friends yet.<br/>Go to <b>Find</b> tab to add your partner!</div>`;
  } else {
    friends.forEach(f => {
      const card = document.createElement('div');
      card.className = `user-card ${activeFriend === f.username ? 'active-chat' : ''}`;
      const unreads = unreadCounts[f.username.toLowerCase()] || 0;
      card.innerHTML = `
        <div class="user-card-left">
          <div class="avatar-circle small">${f.username.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-card-name">
              ${escapeHTML(f.username)}
              ${unreads > 0 ? `<span class="user-unread-badge">${unreads}</span>` : ''}
            </div>
            <div class="user-card-sub">
              <span class="${f.online ? 'dot-online' : 'dot-offline'}"></span>
              ${f.online ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
        <div class="user-card-actions">
          <button type="button" class="mini-btn call-voice" title="Voice Call">📞</button>
          <button type="button" class="mini-btn call-video" title="Video Call">📹</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectFriend(f.username);
        closeMobileSidebar();
      });

      card.querySelector('.call-voice').addEventListener('click', (e) => {
        e.stopPropagation();
        selectFriend(f.username);
        closeMobileSidebar();
        startCall(f.username, false);
      });

      card.querySelector('.call-video').addEventListener('click', (e) => {
        e.stopPropagation();
        selectFriend(f.username);
        closeMobileSidebar();
        startCall(f.username, true);
      });

      friendsListEl.appendChild(card);
    });
  }

  // 2. Requests Tab
  requestsListEl.innerHTML = '';
  if (requests.length === 0) {
    requestsListEl.innerHTML = `<div class="empty-list-msg">No pending friend requests.</div>`;
  } else {
    requests.forEach(r => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-left">
          <div class="avatar-circle small">${r.username.charAt(0).toUpperCase()}</div>
          <div class="user-card-name">${escapeHTML(r.username)}</div>
        </div>
        <div class="user-card-actions">
          <button type="button" class="mini-btn accept">✓ Accept</button>
          <button type="button" class="mini-btn decline">✕</button>
        </div>
      `;
      card.querySelector('.accept').addEventListener('click', () => {
        socket.emit('respond-friend-request', { requester: r.username, action: 'accept' });
      });
      card.querySelector('.decline').addEventListener('click', () => {
        socket.emit('respond-friend-request', { requester: r.username, action: 'decline' });
      });
      requestsListEl.appendChild(card);
    });
  }

  // 3. Find Tab
  findListEl.innerHTML = '';
  if (discover.length === 0) {
    findListEl.innerHTML = `<div class="empty-list-msg">No other registered users found.</div>`;
  } else {
    discover.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-card';
      const isReq = u.status === 'requested';
      card.innerHTML = `
        <div class="user-card-left">
          <div class="avatar-circle small">${u.username.charAt(0).toUpperCase()}</div>
          <div class="user-card-name">${escapeHTML(u.username)}</div>
        </div>
        <div class="user-card-actions">
          <button type="button" class="mini-btn ${isReq ? '' : 'primary'}" ${isReq ? 'disabled' : ''}>
            ${isReq ? '⏳ Requested' : '➕ Add Friend'}
          </button>
        </div>
      `;
      if (!isReq) {
        card.querySelector('button').addEventListener('click', () => {
          socket.emit('send-friend-request', { to: u.username });
        });
      }
      findListEl.appendChild(card);
    });
  }
}

// ================= NOTIFICATION SOUND & VISUAL ALERTS =================

function playNotificationSound() {
  // CRITICAL: Sound ONLY plays when Notification toggle is explicitly turned ON
  if (!soundNotificationsEnabled) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Pleasant two-tone chime (E5: 659.25Hz -> A5: 880.00Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.08);
    gain2.gain.setValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.28);
  } catch (err) {
    console.warn('[NotificationSound] AudioContext error:', err);
  }
}

function unlockAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}
window.addEventListener('click', unlockAudioContext, { passive: true });
window.addEventListener('keydown', unlockAudioContext, { passive: true });
window.addEventListener('touchstart', unlockAudioContext, { passive: true });

function triggerTitleAlert(senderName) {
  if (!document.hidden && document.hasFocus()) return;
  if (titleBlinkInterval) clearInterval(titleBlinkInterval);

  let toggle = false;
  titleBlinkInterval = setInterval(() => {
    document.title = toggle
      ? `💬 New message from ${senderName}!`
      : `(1) Private Space 💜`;
    toggle = !toggle;
  }, 1000);
}

function resetTitleAlert() {
  if (titleBlinkInterval) {
    clearInterval(titleBlinkInterval);
    titleBlinkInterval = null;
  }
  document.title = originalDocumentTitle;
}

window.addEventListener('focus', resetTitleAlert);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.hasFocus()) {
    resetTitleAlert();
  }
});

function showNotificationBanner(sender, text) {
  if (!notifBanner) return;

  if (notifAvatar) notifAvatar.textContent = (sender || '?').charAt(0).toUpperCase();
  if (notifSender) notifSender.textContent = sender;
  if (notifText) notifText.textContent = text;

  notifBanner.classList.remove('dismissing');
  notifBanner.style.display = 'flex';

  if (notifBannerTimeout) clearTimeout(notifBannerTimeout);
  notifBannerTimeout = setTimeout(dismissNotificationBanner, 4500);
}

function dismissNotificationBanner() {
  if (!notifBanner) return;
  notifBanner.classList.add('dismissing');
  setTimeout(() => {
    if (notifBanner && notifBanner.classList.contains('dismissing')) {
      notifBanner.style.display = 'none';
      notifBanner.classList.remove('dismissing');
    }
  }, 260);
}

if (notifCloseBtn) {
  notifCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNotificationBanner();
  });
}

if (notifBanner) {
  notifBanner.addEventListener('click', () => {
    const sender = notifSender ? notifSender.textContent : null;
    dismissNotificationBanner();
    if (sender) {
      selectFriend(sender);
      closeMobileSidebar();
    }
  });
}

// ================= SETTINGS MODAL & SOUND PREFERENCE =================

function openSettingsModal() {
  if (settingsModal) {
    if (toggleSoundNotifications) {
      toggleSoundNotifications.checked = soundNotificationsEnabled;
    }
    settingsModal.style.display = 'flex';
  }
}

function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.style.display = 'none';
  }
}

if (toggleSoundNotifications) {
  // Ensure DOM toggle is initialized (OFF by default)
  toggleSoundNotifications.checked = soundNotificationsEnabled;
  toggleSoundNotifications.addEventListener('change', (e) => {
    soundNotificationsEnabled = e.target.checked;
    localStorage.setItem('sound_notifications_enabled', String(soundNotificationsEnabled));
  });
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
if (headerSettingsBtn) headerSettingsBtn.addEventListener('click', openSettingsModal);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', closeSettingsModal);

if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
}

// ================= PRIVATE 1-ON-1 CHAT =================

function selectFriend(friendName) {
  activeFriend = friendName;
  if (friendName) {
    delete unreadCounts[friendName.toLowerCase()];
  }
  resetTitleAlert();

  emptyChatState.style.display = 'none';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.placeholder = `Message ${friendName}...`;

  // Immediately clear chat to maintain absolute privacy between friends
  messagesList.innerHTML = '';

  updateActiveFriendHeader();
  renderSocialLists();
  socket.emit('load-private-chat', { friend: friendName });
}

function updateActiveFriendHeader() {
  if (!activeFriend) return;
  const friendObj = socialState.friends.find(f => (f.username || '').toLowerCase() === activeFriend.toLowerCase());
  const isOnline = friendObj ? friendObj.online : false;

  headerAvatar.textContent = activeFriend.charAt(0).toUpperCase();
  headerTitle.textContent = activeFriend;
  headerSubtitle.textContent = isOnline ? '🟢 Online right now' : '⚪ Currently offline';
  headerCallActions.style.display = 'flex';
}

headerVoiceBtn.addEventListener('click', () => {
  if (activeFriend) startCall(activeFriend, false);
});

headerVideoBtn.addEventListener('click', () => {
  if (activeFriend) startCall(activeFriend, true);
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activeFriend) return;
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit('private-message', { to: activeFriend, text });
  messageInput.value = '';
});

function appendMessage(msg) {
  if (!msg || !msg.text) return;
  if (msg.id && document.querySelector(`.msg-row[data-id="${msg.id}"]`)) return;

  const isMine = (msg.username || '').toLowerCase() === (currentUser || '').toLowerCase();
  const li = document.createElement('li');
  li.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;
  if (msg.id) li.dataset.id = msg.id;

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  li.innerHTML = `
    <div class="msg-bubble">${escapeHTML(msg.text)}</div>
    <div class="msg-meta">
      <span>${isMine ? 'You' : escapeHTML(msg.username)} • ${time}</span>
      ${isMine ? `<button type="button" class="delete-msg-btn" title="Delete">🗑️</button>` : ''}
    </div>
  `;

  if (isMine && msg.id) {
    li.querySelector('.delete-msg-btn').addEventListener('click', () => {
      socket.emit('delete-message', { id: msg.id, friend: activeFriend });
    });
  }

  messagesList.appendChild(li);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ================= WEBRTC AUDIO & VIDEO CALLING =================

async function startCall(targetUser, videoEnabled) {
  const friendObj = socialState.friends.find(f => (f.username || '').toLowerCase() === targetUser.toLowerCase());
  if (!friendObj || !friendObj.online) {
    alert(`${targetUser} is currently offline.`);
    return;
  }

  currentCallPartner = targetUser;
  isCurrentCallVideo = videoEnabled;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: videoEnabled
    });
  } catch (err) {
    alert('Please allow microphone/camera permissions to make a call.');
    return;
  }

  outgoingCalleeAvatar.textContent = targetUser.charAt(0).toUpperCase();
  outgoingCalleeName.textContent = `Calling ${targetUser}...`;
  outgoingOverlay.style.display = 'flex';

  createPeerConnection(targetUser);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('call-user', {
    to: targetUser,
    offer,
    isVideo: videoEnabled
  });
}

function handleIncomingCall({ from, offer, isVideo }) {
  if (peerConnection) return;
  currentCallPartner = from;
  incomingOfferData = offer;
  isCurrentCallVideo = Boolean(isVideo);

  incomingCallerAvatar.textContent = from.charAt(0).toUpperCase();
  incomingCallerName.textContent = `${from} is calling...`;
  incomingCallType.textContent = isCurrentCallVideo ? '📹 Incoming Video Call' : '📞 Incoming Voice Call';
  incomingOverlay.style.display = 'flex';
}

acceptCallBtn.addEventListener('click', async () => {
  incomingOverlay.style.display = 'none';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isCurrentCallVideo
    });
  } catch (err) {
    alert('Microphone/Camera permission denied.');
    socket.emit('reject-call', { to: currentCallPartner });
    cleanupCallUI();
    return;
  }

  createPeerConnection(currentCallPartner);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOfferData));
  await flushIceQueue();

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit('make-answer', {
    to: currentCallPartner,
    answer
  });

  showActiveCallScreen();
});

declineCallBtn.addEventListener('click', () => {
  if (currentCallPartner) {
    socket.emit('reject-call', { to: currentCallPartner });
  }
  cleanupCallUI();
});

cancelCallBtn.addEventListener('click', () => {
  if (currentCallPartner) {
    socket.emit('end-call', { to: currentCallPartner });
  }
  cleanupCallUI();
});

async function handleCallAnswered({ answer }) {
  outgoingOverlay.style.display = 'none';
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  await flushIceQueue();
  showActiveCallScreen();
}

async function handleNewIceCandidate({ candidate }) {
  if (!candidate) return;
  if (peerConnection && peerConnection.remoteDescription) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } else {
    iceCandidateQueue.push(candidate);
  }
}

async function flushIceQueue() {
  while (iceCandidateQueue.length > 0) {
    const c = iceCandidateQueue.shift();
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(c));
    } catch (e) {}
  }
}

function createPeerConnection(partnerUsername) {
  peerConnection = new RTCPeerConnection(rtcConfig);
  iceCandidateQueue = [];

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', {
        to: partnerUsername,
        candidate: e.candidate
      });
    }
  };

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };
}

function showActiveCallScreen() {
  callModal.style.display = 'block';
  localVideo.srcObject = localStream;

  if (isCurrentCallVideo) {
    localVideoWrap.style.display = 'block';
    audioPlaceholder.style.display = 'none';
    toggleCamBtn.style.display = 'inline-block';
  } else {
    localVideoWrap.style.display = 'none';
    audioPlaceholder.style.display = 'flex';
    activeCallAvatar.textContent = currentCallPartner.charAt(0).toUpperCase();
    activeCallUsername.textContent = currentCallPartner;
    toggleCamBtn.style.display = 'none';
  }

  // Default to speakerphone on call start and initialize routing
  applyAudioRouting('speaker');

  callSeconds = 0;
  callTimerEl.textContent = '00:00';
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    callTimerEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
  }
});

toggleCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    toggleCamBtn.classList.toggle('muted', !videoTrack.enabled);
  }
});

// Audio Output Routing Controls (Speaker vs Earpiece)
if (toggleAudioRouteBtn) {
  toggleAudioRouteBtn.addEventListener('click', () => {
    const nextMode = currentAudioRoute === 'speaker' ? 'earpiece' : 'speaker';
    applyAudioRouting(nextMode);
  });
}

function showCallToast(icon, text) {
  if (!callToast) return;
  if (callToastIcon) callToastIcon.textContent = icon;
  if (callToastText) callToastText.textContent = text;

  callToast.classList.remove('fade-out');
  callToast.style.display = 'flex';

  if (callToastTimeout) clearTimeout(callToastTimeout);
  callToastTimeout = setTimeout(() => {
    callToast.classList.add('fade-out');
    setTimeout(() => {
      if (callToast && callToast.classList.contains('fade-out')) {
        callToast.style.display = 'none';
      }
    }, 300);
  }, 1800);
}

async function applyAudioRouting(mode) {
  currentAudioRoute = mode;
  const isSpeaker = mode === 'speaker';

  // 1. Update toggle button appearance
  if (toggleAudioRouteBtn) {
    toggleAudioRouteBtn.textContent = isSpeaker ? '🔊' : '📞';
    toggleAudioRouteBtn.title = isSpeaker
      ? 'Current: Speakerphone (Click for Earpiece)'
      : 'Current: Earpiece / Normal Call (Click for Speakerphone)';
    toggleAudioRouteBtn.classList.toggle('earpiece-mode', !isSpeaker);
  }

  // 2. Display visual toast inside call modal
  showCallToast(
    isSpeaker ? '🔊' : '📞',
    isSpeaker ? 'Speakerphone Mode' : 'Earpiece / Normal Call'
  );

  // 3. Device output routing via setSinkId if supported
  if (remoteVideo && typeof remoteVideo.setSinkId === 'function') {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (audioOutputs.length > 0) {
        let targetSinkId = '';
        if (isSpeaker) {
          const speakerDev = audioOutputs.find(d =>
            /speaker|loudspeaker|external/i.test(d.label)
          );
          targetSinkId = speakerDev ? speakerDev.deviceId : 'default';
        } else {
          const earpieceDev = audioOutputs.find(d =>
            /earpiece|receiver|handset|phone|internal|telephony/i.test(d.label)
          );
          if (earpieceDev) {
            targetSinkId = earpieceDev.deviceId;
          } else {
            const nonSpeaker = audioOutputs.find(d =>
              !/speaker|loudspeaker/i.test(d.label) && d.deviceId && d.deviceId !== 'default'
            );
            targetSinkId = nonSpeaker ? nonSpeaker.deviceId : 'default';
          }
        }

        if (targetSinkId !== undefined) {
          await remoteVideo.setSinkId(targetSinkId);
          console.log(`[AudioRoute] Output routed via setSinkId to: ${targetSinkId} (${mode})`);
        }
      }
    } catch (sinkErr) {
      console.warn('[AudioRoute] setSinkId error:', sinkErr);
    }
  }

  // 4. Acoustic volume adjustment (Earpiece mode is comfortably attenuated for ear proximity)
  if (remoteVideo) {
    remoteVideo.volume = isSpeaker ? 1.0 : 0.55;
  }

  // 5. AudioSession API integration if supported
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = isSpeaker ? 'playback' : 'play-and-record';
    } catch (e) {}
  }
}

// React dynamically when headphones/audio devices are plugged/unplugged
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (callModal && callModal.style.display !== 'none') {
      applyAudioRouting(currentAudioRoute);
    }
  });
}

endCallBtn.addEventListener('click', () => {
  if (currentCallPartner) {
    socket.emit('end-call', { to: currentCallPartner });
  }
  cleanupCallUI();
});

function cleanupCallUI() {
  incomingOverlay.style.display = 'none';
  outgoingOverlay.style.display = 'none';
  callModal.style.display = 'none';

  clearInterval(callTimerInterval);

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  currentCallPartner = null;
  incomingOfferData = null;
  iceCandidateQueue = [];

  // Reset Audio Routing State
  currentAudioRoute = 'speaker';
  if (toggleAudioRouteBtn) {
    toggleAudioRouteBtn.textContent = '🔊';
    toggleAudioRouteBtn.title = 'Audio Output: Speakerphone (Click to switch to Earpiece)';
    toggleAudioRouteBtn.classList.remove('earpiece-mode');
  }
  if (callToast) {
    callToast.style.display = 'none';
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
