let socket = null;
let currentUser = null;
let activeFriend = null;
let socialState = { friends: [], requests: [], discover: [] };
let typingTimeout = null;

// User Preferences (Notification sound OFF by default as requested!)
const userSettings = {
  soundEnabled: localStorage.getItem('ps_sound') === 'true', // default false
  vibrateEnabled: localStorage.getItem('ps_vibrate') !== 'false', // default true
  autoLogin: localStorage.getItem('ps_autologin') !== 'false' // default true
};

// WebRTC & Calling State
let peerConnection = null;
let localStream = null;
let currentCallPartner = null;
let incomingOfferData = null;
let isCurrentCallVideo = true;
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
let isSpeakerphone = false; // false = Earpiece (Normal Call), true = Speakerphone
let iceCandidateQueue = [];
let callTimerInterval = null;
let callRingTimeout = null;
let toneInterval = null;
let audioCtx = null;
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
const authTabsBox = document.getElementById('auth-tabs-box');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const passwordLabel = document.getElementById('password-label');
const recoveryGroup = document.getElementById('recovery-group');
const recoveryLabel = document.getElementById('recovery-label');
const authRecovery = document.getElementById('auth-recovery');
const togglePasswordBtn = document.getElementById('toggle-password');
const eyeOpen = document.getElementById('eye-open');
const eyeClosed = document.getElementById('eye-closed');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');
const deleteAccountLinkBtn = document.getElementById('delete-account-link-btn');
const backToLoginBtn = document.getElementById('back-to-login-btn');
const authFeedback = document.getElementById('auth-feedback');

// DOM Elements - Sidebar & Header
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const emptyOpenMenuBtn = document.getElementById('empty-open-menu-btn');
const myAvatar = document.getElementById('my-avatar');
const myUsername = document.getElementById('my-username');
const openSettingsBtn = document.getElementById('open-settings-btn');
const headerSettingsBtn = document.getElementById('header-settings-btn');
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

// DOM Elements - Settings Modal
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const toggleSoundCheckbox = document.getElementById('toggle-sound');
const toggleVibrateCheckbox = document.getElementById('toggle-vibrate');
const toggleAutologinCheckbox = document.getElementById('toggle-autologin');
const enablePushBtn = document.getElementById('enable-push-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const changePassForm = document.getElementById('change-pass-form');
const cpOld = document.getElementById('cp-old');
const cpNew = document.getElementById('cp-new');
const cpPin = document.getElementById('cp-pin');
const cpFeedback = document.getElementById('cp-feedback');

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
const videoStage = document.getElementById('video-stage');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const localVideoWrap = document.getElementById('local-video-wrap');
const audioPlaceholder = document.getElementById('audio-call-placeholder');
const activeCallAvatar = document.getElementById('active-call-avatar');
const activeCallUsername = document.getElementById('active-call-username');
const audioModeLabel = document.getElementById('audio-mode-label');
const remoteStatusPill = document.getElementById('remote-status-pill');
const callTimerEl = document.getElementById('call-timer');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const flipCamBtn = document.getElementById('flip-cam-btn');
const toggleSpeakerBtn = document.getElementById('toggle-speaker-btn');
const endCallBtn = document.getElementById('end-call-btn');

let authMode = 'login'; // 'login' | 'register' | 'reset'

// Initialize Settings UI
toggleSoundCheckbox.checked = userSettings.soundEnabled;
toggleVibrateCheckbox.checked = userSettings.vibrateEnabled;
toggleAutologinCheckbox.checked = userSettings.autoLogin;

// Auto-Login Check on Page Load
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('ps_username');
  if (userSettings.autoLogin && savedUser) {
    enterApp(savedUser);
  }
});

// ================= WEB AUDIO API SYNTHESIZER (NO EXTERNAL MP3 NEEDED) =================

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playMessageBeep() {
  if (!userSettings.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

function startCallTone(type) {
  stopCallTone();
  const playPulse = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      if (type === 'incoming') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2); // A5
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
      } else {
        // Outgoing phone ringback tone
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}

    if (type === 'incoming' && userSettings.vibrateEnabled && navigator.vibrate) {
      navigator.vibrate([300, 150, 300]);
    }
  };
  playPulse();
  toneInterval = setInterval(playPulse, 2000);
}

function stopCallTone() {
  if (toneInterval) {
    clearInterval(toneInterval);
    toneInterval = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

// ================= AUTHENTICATION & FORGOT PASSWORD UI =================

function setAuthMode(mode) {
  authMode = mode;
  hideFeedback();

  if (mode === 'login') {
    authTabsBox.style.display = 'flex';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    recoveryGroup.style.display = 'none';
    passwordLabel.textContent = 'Password';
    authPassword.required = true;
    authSubmitBtn.textContent = 'Sign In';
    authSubmitBtn.classList.remove('btn-danger');
    forgotPasswordBtn.style.display = 'inline-block';
    if (deleteAccountLinkBtn) deleteAccountLinkBtn.style.display = 'inline-block';
    backToLoginBtn.style.display = 'none';
  } else if (mode === 'register') {
    authTabsBox.style.display = 'flex';
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    recoveryGroup.style.display = 'block';
    recoveryLabel.textContent = 'Set Secret Recovery PIN (Optional, default: 0119)';
    passwordLabel.textContent = 'Password';
    authPassword.required = true;
    authSubmitBtn.textContent = 'Create Account';
    authSubmitBtn.classList.remove('btn-danger');
    forgotPasswordBtn.style.display = 'none';
    if (deleteAccountLinkBtn) deleteAccountLinkBtn.style.display = 'none';
    backToLoginBtn.style.display = 'none';
  } else if (mode === 'reset') {
    authTabsBox.style.display = 'none';
    recoveryGroup.style.display = 'block';
    recoveryLabel.textContent = 'Enter Secret Recovery PIN (or Master PIN: 0119)';
    passwordLabel.textContent = 'New Password (min 6 chars)';
    authPassword.required = true;
    authSubmitBtn.textContent = 'Reset Password';
    authSubmitBtn.classList.remove('btn-danger');
    forgotPasswordBtn.style.display = 'none';
    if (deleteAccountLinkBtn) deleteAccountLinkBtn.style.display = 'none';
    backToLoginBtn.style.display = 'inline-block';
  } else if (mode === 'delete') {
    authTabsBox.style.display = 'none';
    recoveryGroup.style.display = 'block';
    recoveryLabel.textContent = 'Password OR Secret Recovery PIN (0119)';
    passwordLabel.textContent = 'Password (or leave blank if using PIN above)';
    authPassword.required = false;
    authSubmitBtn.textContent = 'Permanently Delete Account';
    authSubmitBtn.classList.add('btn-danger');
    forgotPasswordBtn.style.display = 'none';
    if (deleteAccountLinkBtn) deleteAccountLinkBtn.style.display = 'none';
    backToLoginBtn.style.display = 'inline-block';
  }
}

tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));
forgotPasswordBtn.addEventListener('click', () => setAuthMode('reset'));
if (deleteAccountLinkBtn) deleteAccountLinkBtn.addEventListener('click', () => setAuthMode('delete'));
backToLoginBtn.addEventListener('click', () => setAuthMode('login'));

togglePasswordBtn.addEventListener('click', () => {
  const isPass = authPassword.type === 'password';
  authPassword.type = isPass ? 'text' : 'password';
  eyeOpen.style.display = isPass ? 'none' : 'block';
  eyeClosed.style.display = isPass ? 'block' : 'none';
});

function showFeedback(msg, type = 'error') {
  authFeedback.textContent = msg;
  authFeedback.className = `auth-feedback ${type}`;
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
  const recoveryCode = authRecovery.value.trim();

  if (authMode === 'reset') {
    try {
      const res = await fetch('/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, recoveryCode, newPassword: password })
      });
      const data = await res.json();
      if (!res.ok) {
        showFeedback(data.error || 'Reset failed', 'error');
        return;
      }
      setAuthMode('login');
      authPassword.value = '';
      showFeedback(data.message || 'Password reset complete! Please sign in.', 'success');
    } catch (err) {
      showFeedback('Network error. Please try again.');
    }
    return;
  }

  if (authMode === 'delete') {
    if (!username) {
      showFeedback('Please enter your username.', 'error');
      return;
    }
    if (!password && !recoveryCode) {
      showFeedback('Enter either your password or Secret Recovery PIN (0119).', 'error');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete account "${username}"?`)) {
      return;
    }
    try {
      const res = await fetch('/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, recoveryCode })
      });
      const data = await res.json();
      if (!res.ok) {
        showFeedback(data.error || 'Failed to delete account.', 'error');
        return;
      }
      localStorage.removeItem('ps_username');
      setAuthMode('login');
      authUsername.value = '';
      authPassword.value = '';
      authRecovery.value = '';
      showFeedback(data.message || 'Account successfully deleted! You can now register.', 'success');
    } catch (err) {
      showFeedback('Network error. Please try again.');
    }
    return;
  }

  const endpoint = authMode === 'login' ? '/login' : '/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, recoveryCode })
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Authentication failed');
      return;
    }
    if (userSettings.autoLogin) {
      localStorage.setItem('ps_username', data.username);
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
  localStorage.removeItem('ps_username');
  currentUser = null;
  activeFriend = null;
  messagesList.innerHTML = '';
  chatContainer.style.display = 'none';
  authContainer.style.display = 'flex';
  authPassword.value = '';
});

// ================= SETTINGS MODAL LOGIC =================

function openSettings() {
  cpFeedback.style.display = 'none';
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  settingsModal.style.display = 'none';
}

openSettingsBtn.addEventListener('click', openSettings);
headerSettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);

toggleSoundCheckbox.addEventListener('change', () => {
  userSettings.soundEnabled = toggleSoundCheckbox.checked;
  localStorage.setItem('ps_sound', userSettings.soundEnabled);
  if (userSettings.soundEnabled) playMessageBeep();
});

toggleVibrateCheckbox.addEventListener('change', () => {
  userSettings.vibrateEnabled = toggleVibrateCheckbox.checked;
  localStorage.setItem('ps_vibrate', userSettings.vibrateEnabled);
});

toggleAutologinCheckbox.addEventListener('change', () => {
  userSettings.autoLogin = toggleAutologinCheckbox.checked;
  localStorage.setItem('ps_autologin', userSettings.autoLogin);
  if (userSettings.autoLogin && currentUser) {
    localStorage.setItem('ps_username', currentUser);
  } else {
    localStorage.removeItem('ps_username');
  }
});

enablePushBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    alert('Browser notifications are not supported on this device.');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    enablePushBtn.textContent = '✓ Enabled';
    new Notification('Private Space 💜', { body: 'Background alerts are now active!' });
  } else {
    alert('Please allow notification permission in your browser settings.');
  }
});

clearChatBtn.addEventListener('click', () => {
  if (!activeFriend) {
    alert('Select a friend first.');
    return;
  }
  if (confirm(`Delete all chat messages with ${activeFriend} for both of you?`)) {
    socket.emit('clear-chat', { friend: activeFriend });
    closeSettings();
  }
});

changePassForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  cpFeedback.style.display = 'none';
  try {
    const res = await fetch('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        oldPassword: cpOld.value,
        newPassword: cpNew.value,
        newRecoveryCode: cpPin.value.trim()
      })
    });
    const data = await res.json();
    cpFeedback.textContent = data.message || data.error;
    cpFeedback.className = `auth-feedback ${res.ok ? 'success' : 'error'}`;
    cpFeedback.style.display = 'block';
    if (res.ok) {
      cpOld.value = '';
      cpNew.value = '';
      cpPin.value = '';
    }
  } catch (err) {
    cpFeedback.textContent = 'Error updating password.';
    cpFeedback.className = 'auth-feedback error';
    cpFeedback.style.display = 'block';
  }
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

if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', openMobileSidebar);
if (emptyOpenMenuBtn) emptyOpenMenuBtn.addEventListener('click', openMobileSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

sideTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    sideTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ================= SOCKET.IO & REAL-TIME CHAT =================

function connectSocket() {
  socket = io({ query: { username: currentUser } });

  socket.on('social-data', (data) => {
    socialState = data;
    renderSocialLists();

    if (!activeFriend && data.friends.length === 1) {
      selectFriend(data.friends[0].username);
    } else if (activeFriend) {
      updateActiveFriendHeader();
    }
  });

  socket.on('private-chat-history', ({ friend, messages }) => {
    if (friend !== activeFriend) return;
    messagesList.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });

  socket.on('private-message', (msg) => {
    const isMine = msg.username === currentUser;
    const isRelevant =
      (isMine && msg.recipient === activeFriend) ||
      (msg.username === activeFriend && msg.recipient === currentUser);

    if (!isMine) {
      playMessageBeep();
      if (userSettings.vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(180);
      }
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`New message from ${msg.username}`, { body: msg.text });
      }
    }

    if (isRelevant) {
      appendMessage(msg);
      scrollToBottom();
      if (!isMine && !document.hidden) {
        socket.emit('mark-seen', { friend: activeFriend });
      }
    }
  });

  socket.on('messages-seen', ({ by }) => {
    if (by !== activeFriend) return;
    document.querySelectorAll('.seen-status').forEach(el => {
      el.textContent = '✓✓ Seen';
      el.classList.add('is-seen');
    });
  });

  socket.on('typing', ({ from }) => {
    if (from === activeFriend) {
      headerSubtitle.textContent = '✍️ typing...';
      headerSubtitle.classList.add('typing-glow');
    }
  });

  socket.on('stop-typing', ({ from }) => {
    if (from === activeFriend) {
      headerSubtitle.classList.remove('typing-glow');
      updateActiveFriendHeader();
    }
  });

  socket.on('message-reacted', ({ id, reaction }) => {
    const row = document.querySelector(`.msg-row[data-id="${id}"]`);
    if (!row) return;
    const pill = row.querySelector('.reaction-pill');
    if (pill) {
      pill.style.display = reaction ? 'inline-block' : 'none';
      pill.textContent = reaction || '';
    }
  });

  socket.on('message-deleted', (id) => {
    const el = document.querySelector(`.msg-row[data-id="${id}"]`);
    if (el) el.remove();
  });

  socket.on('chat-cleared', ({ friend }) => {
    if (friend === activeFriend) {
      messagesList.innerHTML = '';
    }
  });

  // WebRTC Signaling Listeners
  socket.on('incoming-call', handleIncomingCall);
  socket.on('call-answered', handleCallAnswered);
  socket.on('ice-candidate', handleNewIceCandidate);
  socket.on('call-media-state', ({ micEnabled, camEnabled }) => {
    const states = [];
    if (micEnabled === false) states.push('🔇 Mic Muted');
    if (camEnabled === false) states.push('📷 Camera Off');
    if (states.length > 0) {
      remoteStatusPill.textContent = states.join(' • ');
      remoteStatusPill.style.display = 'block';
    } else {
      remoteStatusPill.style.display = 'none';
    }
  });
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

  badgeFriends.textContent = friends.length;
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
      card.innerHTML = `
        <div class="user-card-left">
          <div class="avatar-circle small">${f.username.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-card-name">${escapeHTML(f.username)}</div>
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

// ================= PRIVATE 1-ON-1 CHAT =================

function selectFriend(friendName) {
  activeFriend = friendName;
  emptyChatState.style.display = 'none';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.placeholder = `Message ${friendName}...`;

  updateActiveFriendHeader();
  renderSocialLists();
  socket.emit('load-private-chat', { friend: friendName });
}

function updateActiveFriendHeader() {
  if (!activeFriend) return;
  const friendObj = socialState.friends.find(f => f.username === activeFriend);
  const isOnline = friendObj ? friendObj.online : false;

  headerAvatar.textContent = activeFriend.charAt(0).toUpperCase();
  headerTitle.textContent = activeFriend;
  headerSubtitle.textContent = isOnline ? '🟢 Online right now' : '⚪ Offline (Messages will be saved)';
  headerCallActions.style.display = 'flex';
}

messageInput.addEventListener('input', () => {
  if (!activeFriend || !socket) return;
  socket.emit('typing', { to: activeFriend });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop-typing', { to: activeFriend });
  }, 1200);
});

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
  socket.emit('stop-typing', { to: activeFriend });
  messageInput.value = '';
});

function appendMessage(msg) {
  if (document.querySelector(`.msg-row[data-id="${msg.id}"]`)) return;

  const isMine = msg.username === currentUser;
  const li = document.createElement('li');
  li.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;
  li.dataset.id = msg.id;

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const seenHTML = isMine
    ? `<span class="seen-status ${msg.seen ? 'is-seen' : ''}">${msg.seen ? '✓✓ Seen' : '✓ Sent'}</span>`
    : '';

  li.innerHTML = `
    <div class="msg-bubble-wrap">
      <div class="msg-bubble" title="Double-tap to react ❤️">
        ${escapeHTML(msg.text)}
        <span class="reaction-pill" style="display: ${msg.reaction ? 'inline-block' : 'none'};">${msg.reaction || ''}</span>
      </div>
    </div>
    <div class="msg-meta">
      <span>${isMine ? 'You' : escapeHTML(msg.username)} • ${time}</span>
      ${seenHTML}
      <button type="button" class="msg-action-btn react-btn" title="Heart Reaction">♡</button>
      ${isMine ? `<button type="button" class="msg-action-btn delete-msg-btn" title="Delete">🗑️</button>` : ''}
    </div>
  `;

  const triggerReaction = () => {
    socket.emit('react-message', { id: msg.id, friend: activeFriend });
  };

  li.querySelector('.msg-bubble').addEventListener('dblclick', triggerReaction);
  li.querySelector('.react-btn').addEventListener('click', triggerReaction);

  if (isMine) {
    li.querySelector('.delete-msg-btn').addEventListener('click', () => {
      socket.emit('delete-message', { id: msg.id, friend: activeFriend });
    });
  }

  messagesList.appendChild(li);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ================= REAL-WORLD WEBRTC AUDIO & VIDEO CALLING =================

// Tap Local PiP Video to Swap Fullscreen
localVideoWrap.addEventListener('click', () => {
  videoStage.classList.toggle('swapped-pip');
});

async function startCall(targetUser, videoEnabled) {
  const friendObj = socialState.friends.find(f => f.username === targetUser);
  if (!friendObj || !friendObj.online) {
    alert(`${targetUser} is currently offline. You can still send them messages!`);
    return;
  }

  currentCallPartner = targetUser;
  isCurrentCallVideo = videoEnabled;
  currentFacingMode = 'user';
  isSpeakerphone = videoEnabled; // Video calls default to speaker, Voice calls default to earpiece

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: videoEnabled ? { facingMode: currentFacingMode } : false
    });
  } catch (err) {
    alert('Please allow microphone/camera permissions to make a call.');
    return;
  }

  outgoingCalleeAvatar.textContent = targetUser.charAt(0).toUpperCase();
  outgoingCalleeName.textContent = `Calling ${targetUser}...`;
  outgoingOverlay.style.display = 'flex';
  startCallTone('outgoing');

  createPeerConnection(targetUser);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('call-user', {
    to: targetUser,
    offer,
    isVideo: videoEnabled
  });

  // 30-Second Auto-Timeout + Missed Call Log
  clearTimeout(callRingTimeout);
  callRingTimeout = setTimeout(() => {
    if (outgoingOverlay.style.display !== 'none') {
      socket.emit('end-call', { to: targetUser });
      socket.emit('private-message', {
        to: targetUser,
        text: videoEnabled ? '📞 Missed Video Call' : '📞 Missed Voice Call'
      });
      cleanupCallUI();
    }
  }, 30000);
}

function handleIncomingCall({ from, offer, isVideo }) {
  if (peerConnection) return;
  currentCallPartner = from;
  incomingOfferData = offer;
  isCurrentCallVideo = Boolean(isVideo);
  currentFacingMode = 'user';
  isSpeakerphone = Boolean(isVideo);

  incomingCallerAvatar.textContent = from.charAt(0).toUpperCase();
  incomingCallerName.textContent = `${from} is calling...`;
  incomingCallType.textContent = isCurrentCallVideo ? '📹 Incoming Video Call' : '📞 Incoming Voice Call';
  incomingOverlay.style.display = 'flex';
  startCallTone('incoming');
}

acceptCallBtn.addEventListener('click', async () => {
  stopCallTone();
  incomingOverlay.style.display = 'none';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: isCurrentCallVideo ? { facingMode: currentFacingMode } : false
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
  stopCallTone();
  if (currentCallPartner) {
    socket.emit('reject-call', { to: currentCallPartner });
  }
  cleanupCallUI();
});

cancelCallBtn.addEventListener('click', () => {
  stopCallTone();
  if (currentCallPartner) {
    socket.emit('end-call', { to: currentCallPartner });
    socket.emit('private-message', {
      to: currentCallPartner,
      text: isCurrentCallVideo ? '📞 Missed Video Call' : '📞 Missed Voice Call'
    });
  }
  cleanupCallUI();
});

async function handleCallAnswered({ answer }) {
  stopCallTone();
  clearTimeout(callRingTimeout);
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
  localVideo.classList.toggle('back-cam', currentFacingMode === 'environment');

  if (isCurrentCallVideo) {
    localVideoWrap.style.display = 'block';
    audioPlaceholder.style.display = 'none';
    toggleCamBtn.style.display = 'flex';
    flipCamBtn.style.display = 'flex';
  } else {
    localVideoWrap.style.display = 'none';
    audioPlaceholder.style.display = 'flex';
    activeCallAvatar.textContent = currentCallPartner.charAt(0).toUpperCase();
    activeCallUsername.textContent = currentCallPartner;
    toggleCamBtn.style.display = 'none';
    flipCamBtn.style.display = 'none';
  }

  applyAudioOutputMode();

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

// Switch Earpiece vs Speakerphone
async function applyAudioOutputMode() {
  toggleSpeakerBtn.textContent = isSpeakerphone ? '🔊' : '👂';
  toggleSpeakerBtn.classList.toggle('active-speaker', isSpeakerphone);
  audioModeLabel.textContent = isSpeakerphone
    ? '🔊 Speakerphone Mode Active'
    : '👂 Normal Call (Earpiece Mode)';

  // Dim screen slightly in Earpiece voice mode like a real phone call
  videoStage.classList.toggle('earpiece-dim', !isSpeakerphone && !isCurrentCallVideo);

  // Adjust gain/volume for earpiece comfort vs loudspeaker
  remoteVideo.volume = isSpeakerphone ? 1.0 : 0.65;

  // Attempt hardware sink routing if supported by mobile/desktop browser
  if (typeof remoteVideo.setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      if (audioOutputs.length > 1) {
        const target = audioOutputs.find(d =>
          isSpeakerphone
            ? /speaker/i.test(d.label)
            : /earpiece|receiver|communications|default/i.test(d.label)
        );
        if (target) await remoteVideo.setSinkId(target.deviceId);
      }
    } catch (e) {}
  }
}

toggleSpeakerBtn.addEventListener('click', () => {
  isSpeakerphone = !isSpeakerphone;
  applyAudioOutputMode();
});

// Flip Front / Back Camera during live video call
flipCamBtn.addEventListener('click', async () => {
  if (!localStream || !isCurrentCallVideo) return;
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  try {
    const newVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false
    });
    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    const oldVideoTrack = localStream.getVideoTracks()[0];

    if (oldVideoTrack) {
      localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }
    localStream.addTrack(newVideoTrack);
    localVideo.srcObject = localStream;
    localVideo.classList.toggle('back-cam', currentFacingMode === 'environment');

    if (peerConnection) {
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
    }
  } catch (err) {
    alert('Unable to switch camera on this device.');
  }
});

toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
    emitMediaState();
  }
});

toggleCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    toggleCamBtn.classList.toggle('muted', !videoTrack.enabled);
    emitMediaState();
  }
});

function emitMediaState() {
  if (!currentCallPartner || !localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];
  socket.emit('call-media-state', {
    to: currentCallPartner,
    micEnabled: audioTrack ? audioTrack.enabled : true,
    camEnabled: videoTrack ? videoTrack.enabled : false
  });
}

endCallBtn.addEventListener('click', () => {
  if (currentCallPartner) {
    socket.emit('end-call', { to: currentCallPartner });
  }
  cleanupCallUI();
});

function cleanupCallUI() {
  stopCallTone();
  clearTimeout(callRingTimeout);
  incomingOverlay.style.display = 'none';
  outgoingOverlay.style.display = 'none';
  callModal.style.display = 'none';
  remoteStatusPill.style.display = 'none';
  videoStage.classList.remove('swapped-pip', 'earpiece-dim');
  toggleMicBtn.classList.remove('muted');
  toggleCamBtn.classList.remove('muted');

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
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}