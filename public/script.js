let socket = null;
let currentUser = null;
let currentAuthToken = localStorage.getItem('ps_token') || null;
let activeFriend = null;
let socialState = { friends: [], requests: [], discover: [] };
let typingTimeout = null;
let replyingToMessage = null;
let lastRenderedDateKey = null;
let toastTimer = null;
let swRegistration = null;

const userSettings = {
  soundEnabled: localStorage.getItem('ps_sound') === 'true',
  vibrateEnabled: localStorage.getItem('ps_vibrate') !== 'false',
  autoLogin: localStorage.getItem('ps_autologin') !== 'false'
};

// WebRTC State
let peerConnection = null;
let localStream = null;
let currentCallPartner = null;
let incomingOfferData = null;
let isCurrentCallVideo = true;
let currentFacingMode = 'user';
let isSpeakerphone = false;
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

// DOM Elements - Romantic Stage, Kittens, In-App Toast & Confirm Modal
const heartShowerStage = document.getElementById('heart-shower-stage');
const cuteKittensStage = document.getElementById('cute-kittens-stage');
const appToast = document.getElementById('app-toast');
const appConfirmModal = document.getElementById('app-confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmOkBtn = document.getElementById('confirm-ok-btn');

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
const badgeFind = document.getElementById('badge-find');
const mobileReqDot = document.getElementById('mobile-req-dot');
const friendsListEl = document.getElementById('friends-list');
const requestsListEl = document.getElementById('requests-list');
const findListEl = document.getElementById('find-list');

const headerAvatar = document.getElementById('header-avatar');
const headerTitle = document.getElementById('header-title');
const headerSubtitle = document.getElementById('header-subtitle');
const headerCallActions = document.getElementById('header-call-actions');
const headerVoiceBtn = document.getElementById('header-voice-btn');
const headerVideoBtn = document.getElementById('header-video-btn');
const emptyChatState = document.getElementById('empty-chat-state');
const messagesList = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');
const replyPreviewBar = document.getElementById('reply-preview-bar');
const replyPreviewUser = document.getElementById('reply-preview-user');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
const chatForm = document.getElementById('chat-form');
const heartShowerBtn = document.getElementById('heart-shower-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// DOM Elements - Settings Modal
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const toggleSoundCheckbox = document.getElementById('toggle-sound');
const toggleVibrateCheckbox = document.getElementById('toggle-vibrate');
const toggleAutologinCheckbox = document.getElementById('toggle-autologin');
const enablePushBtn = document.getElementById('enable-push-btn');
const pushStatusDesc = document.getElementById('push-status-desc');
const clearChatBtn = document.getElementById('clear-chat-btn');
const deleteMyAccountBtn = document.getElementById('delete-my-account-btn');
const deleteAccountInlineForm = document.getElementById('delete-account-inline-form');
const daPinOrPass = document.getElementById('da-pin-or-pass');
const daFeedback = document.getElementById('da-feedback');
const cancelInlineDeleteBtn = document.getElementById('cancel-inline-delete-btn');
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

let authMode = 'login';

toggleSoundCheckbox.checked = userSettings.soundEnabled;
toggleVibrateCheckbox.checked = userSettings.vibrateEnabled;
toggleAutologinCheckbox.checked = userSettings.autoLogin;

window.addEventListener('DOMContentLoaded', () => {
  initRomanticBackgroundCanvas();
  const savedUser = localStorage.getItem('ps_username');
  if (userSettings.autoLogin && savedUser) {
    enterApp(savedUser, currentAuthToken);
  }
});

// Interactive Kittens Click/Tap Reaction
if (cuteKittensStage) {
  cuteKittensStage.addEventListener('click', () => {
    cuteKittensStage.classList.remove('kitten-jump-boost');
    void cuteKittensStage.offsetWidth;
    cuteKittensStage.classList.add('kitten-jump-boost');
    spawnHeartShower(6);
    if (activeFriend && socket) {
      socket.emit('heart-shower', { to: activeFriend });
    }
  });
}

// ================= LIVE ROMANTIC CANVAS BACKGROUND (HEARTS & FIREFLIES) =================

function initRomanticBackgroundCanvas() {
  const canvas = document.getElementById('romantic-bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const sparkles = [];
  const totalParticles = window.innerWidth < 768 ? 34 : 56;

  function createParticle(randomY = true) {
    const isHeart = Math.random() < 0.44;
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 25,
      size: isHeart ? 7 + Math.random() * 11 : 1.5 + Math.random() * 3,
      speedY: 0.25 + Math.random() * 0.55,
      swayAmp: 0.3 + Math.random() * 0.8,
      swaySpeed: 0.008 + Math.random() * 0.018,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.22 + Math.random() * 0.55,
      isHeart,
      hue: 315 + Math.random() * 45
    };
  }

  for (let i = 0; i < totalParticles; i++) {
    particles.push(createParticle(true));
  }

  function drawHeartPath(x, y, size) {
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(
      x - size / 2,
      y + (size + topCurveHeight) / 2,
      x,
      y + (size + topCurveHeight) / 1.45,
      x,
      y + size
    );
    ctx.bezierCurveTo(
      x,
      y + (size + topCurveHeight) / 1.45,
      x + size / 2,
      y + (size + topCurveHeight) / 2,
      x + size / 2,
      y + topCurveHeight
    );
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
    ctx.closePath();
  }

  const addSparkle = (x, y) => {
    if (sparkles.length > 35) return;
    sparkles.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 16,
      size: 5 + Math.random() * 6,
      alpha: 0.85,
      vy: -0.6 - Math.random() * 0.8
    });
  };

  window.addEventListener('mousemove', (e) => {
    if (Math.random() < 0.28) addSparkle(e.clientX, e.clientY);
  });
  window.addEventListener('touchmove', (e) => {
    if (e.touches[0] && Math.random() < 0.4) {
      addSparkle(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  function renderFrame() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speedY;
      p.phase += p.swaySpeed;
      p.x += Math.sin(p.phase) * p.swayAmp;

      if (p.y < -30) {
        particles[i] = createParticle(false);
        continue;
      }

      const twinkle = 0.75 + 0.25 * Math.sin(p.phase * 2);
      ctx.save();
      if (p.isHeart) {
        ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${p.alpha * twinkle})`;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 65%, 0.55)`;
        ctx.shadowBlur = 10;
        drawHeartPath(p.x, p.y, p.size);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.fillStyle = `hsla(330, 100%, 88%, ${p.alpha * twinkle})`;
        ctx.shadowColor = 'rgba(244, 114, 182, 0.8)';
        ctx.shadowBlur = 8;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.y += s.vy;
      s.alpha -= 0.024;
      if (s.alpha <= 0) {
        sparkles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.fillStyle = `rgba(249, 168, 212, ${s.alpha})`;
      ctx.shadowColor = 'rgba(236, 72, 153, 0.8)';
      ctx.shadowBlur = 8;
      drawHeartPath(s.x, s.y, s.size);
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}

// ================= FLOATING HEART SHOWER =================

function spawnHeartShower(count = 16) {
  if (!heartShowerStage) return;
  const emojis = ['💖', '💗', '🪷', '💕', '💝','🍼','dudu'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const heart = document.createElement('span');
      heart.className = 'floating-heart';
      heart.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      heart.style.left = `${8 + Math.random() * 84}%`;
      heart.style.setProperty('--drift', `${(Math.random() - 0.5) * 90}px`);
      heartShowerStage.appendChild(heart);
      setTimeout(() => heart.remove(), 2900);
    }, i * 75);
  }
}

if (heartShowerBtn) {
  heartShowerBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    socket.emit('heart-shower', { to: activeFriend });
  });
}

// ================= IN-APP TOAST & CUSTOM CONFIRM MODAL =================

function showToast(message, type = 'info') {
  if (!appToast) return;
  appToast.textContent = message;
  appToast.className = `app-toast ${type}`;
  appToast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    appToast.style.display = 'none';
  }, 3400);
}

function showAppConfirm({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm' }) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    appConfirmModal.style.display = 'flex';

    const cleanup = (result) => {
      appConfirmModal.style.display = 'none';
      confirmCancelBtn.removeEventListener('click', onCancel);
      confirmOkBtn.removeEventListener('click', onOk);
      resolve(result);
    };

    const onCancel = () => cleanup(false);
    const onOk = () => cleanup(true);

    confirmCancelBtn.addEventListener('click', onCancel);
    confirmOkBtn.addEventListener('click', onOk);
  });
}

// ================= WEB PUSH & SERVICE WORKER =================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function syncPushSubscription(isManualClick = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (isManualClick) showToast('Push notifications are not supported on this browser.', 'error');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let perm = Notification.permission;
    if (isManualClick && perm !== 'granted') {
      perm = await Notification.requestPermission();
    }

    if (perm !== 'granted') {
      enablePushBtn.textContent = 'Enable';
      if (pushStatusDesc) pushStatusDesc.textContent = 'Receive alerts even when browser is closed';
      if (isManualClick) {
        showToast('Please allow notification permission in browser settings.', 'error');
      }
      return;
    }

    const keyRes = await fetch('/vapid-public-key');
    if (!keyRes.ok) return;
    const { publicKey } = await keyRes.json();
    const savedVapidKey = localStorage.getItem('ps_vapid_key');

    let sub = await swRegistration.pushManager.getSubscription();

    if (sub && (savedVapidKey !== publicKey || isManualClick)) {
      try {
        await sub.unsubscribe();
      } catch (e) {}
      sub = null;
    }

    if (!sub) {
      sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      localStorage.setItem('ps_vapid_key', publicKey);
    }

    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, subscription: sub })
    });

    enablePushBtn.textContent = 'Active • Test';
    enablePushBtn.disabled = false;
    if (pushStatusDesc) {
      pushStatusDesc.textContent = 'Enabled! Tap button anytime to send a test alert';
    }

    if (isManualClick) {
      showToast('Sending test background notification...', 'success');
      const testRes = await fetch('/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser })
      });

      if (!testRes.ok) {
        await swRegistration.showNotification('MINI-WORLD', {
          body: 'Notifications are active on this device!',
          tag: 'push-test'
        });
      }
    }
  } catch (err) {
    console.error('Push setup error:', err);
    if (isManualClick) {
      showToast('Notification error: ' + (err.message || 'Check browser permissions'), 'error');
    }
  }
}

enablePushBtn.addEventListener('click', () => syncPushSubscription(true));

async function triggerBackgroundOSNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if (!swRegistration && 'serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.getRegistration();
    }
    if (swRegistration && swRegistration.showNotification) {
      await swRegistration.showNotification(title, {
        body,
        tag,
        renotify: true,
        vibrate: [200, 100, 200]
      });
    }
  } catch (e) {}
}

// ================= AUDIO SYNTHESIZER =================

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
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
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
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
      } else {
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

// ================= AUTHENTICATION =================

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
    recoveryLabel.textContent = 'Set Recovery PIN (Optional)';
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
    recoveryLabel.textContent = 'Secret Recovery PIN';
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
    recoveryLabel.textContent = 'Secret Recovery PIN (if you forgot password)';
    passwordLabel.textContent = 'Password (or leave blank if using PIN)';
    authPassword.required = false;
    authSubmitBtn.textContent = 'Delete Account';
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
      if (!res.ok) return showFeedback(data.error || 'Reset failed');
      setAuthMode('login');
      authPassword.value = '';
      showFeedback(data.message, 'success');
    } catch (err) {
      showFeedback('Network error. Try again.');
    }
    return;
  }

  if (authMode === 'delete') {
    if (!username) return showFeedback('Enter your username.');
    if (!password && !recoveryCode) return showFeedback('Enter your password or recovery PIN.');

    const confirmed = await showAppConfirm({
      title: 'Delete Account',
      message: `Permanently delete account "${username}" and all chat history?`,
      confirmText: 'Delete Account'
    });
    if (!confirmed) return;

    try {
      const res = await fetch('/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, recoveryCode })
      });
      const data = await res.json();
      if (!res.ok) return showFeedback(data.error || 'Delete failed.');
      localStorage.removeItem('ps_username');
      localStorage.removeItem('ps_token');
      setAuthMode('login');
      authUsername.value = '';
      authPassword.value = '';
      authRecovery.value = '';
      showFeedback(data.message, 'success');
    } catch (err) {
      showFeedback('Network error. Try again.');
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
    if (!res.ok) return showFeedback(data.error || 'Authentication failed');
    if (userSettings.autoLogin) {
      localStorage.setItem('ps_username', data.username);
      if (data.token) localStorage.setItem('ps_token', data.token);
    }
    enterApp(data.username, data.token);
  } catch (err) {
    showFeedback('Network error. Try again.');
  }
});

function enterApp(username, token) {
  currentUser = username;
  if (token) currentAuthToken = token;
  myUsername.textContent = username;
  myAvatar.textContent = username.charAt(0).toUpperCase();

  authContainer.style.display = 'none';
  chatContainer.style.display = 'flex';

  connectSocket();
  syncPushSubscription(false);
}

function forceLogoutToAuth(msg) {
  if (socket) socket.disconnect();
  localStorage.removeItem('ps_username');
  localStorage.removeItem('ps_token');
  currentUser = null;
  currentAuthToken = null;
  activeFriend = null;
  messagesList.innerHTML = '';
  settingsModal.style.display = 'none';
  if (deleteAccountInlineForm) deleteAccountInlineForm.style.display = 'none';
  chatContainer.style.display = 'none';
  authContainer.style.display = 'flex';
  authPassword.value = '';
  setAuthMode('login');
  if (msg) showFeedback(msg, 'success');
}

logoutBtn.addEventListener('click', () => forceLogoutToAuth());

// ================= SETTINGS =================

function openSettings() {
  cpFeedback.style.display = 'none';
  if (daFeedback) daFeedback.style.display = 'none';
  if (deleteAccountInlineForm) deleteAccountInlineForm.style.display = 'none';
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
    localStorage.removeItem('ps_token');
  }
});

clearChatBtn.addEventListener('click', async () => {
  if (!activeFriend) {
    showToast('Select a chat first.', 'error');
    return;
  }
  const confirmed = await showAppConfirm({
    title: 'Clear Chat History',
    message: `Delete all messages with ${activeFriend} for both of you?`,
    confirmText: 'Clear All'
  });
  if (confirmed) {
    socket.emit('clear-chat', { friend: activeFriend });
    closeSettings();
    showToast('Chat history cleared.', 'success');
  }
});

if (deleteMyAccountBtn && deleteAccountInlineForm) {
  deleteMyAccountBtn.addEventListener('click', () => {
    daFeedback.style.display = 'none';
    daPinOrPass.value = '';
    deleteAccountInlineForm.style.display =
      deleteAccountInlineForm.style.display === 'none' ? 'flex' : 'none';
    if (deleteAccountInlineForm.style.display === 'flex') {
      daPinOrPass.focus();
    }
  });

  cancelInlineDeleteBtn.addEventListener('click', () => {
    deleteAccountInlineForm.style.display = 'none';
    daFeedback.style.display = 'none';
  });

  deleteAccountInlineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const val = daPinOrPass.value.trim();
    if (!val) return;

    daFeedback.style.display = 'none';
    try {
      const res = await fetch('/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser,
          password: val,
          recoveryCode: val
        })
      });
      const data = await res.json();
      if (!res.ok) {
        daFeedback.textContent = data.error || 'Incorrect password or PIN.';
        daFeedback.className = 'auth-feedback error';
        daFeedback.style.display = 'block';
        return;
      }
      forceLogoutToAuth(data.message || 'Your account was permanently deleted.');
    } catch (err) {
      daFeedback.textContent = 'Network error deleting account.';
      daFeedback.className = 'auth-feedback error';
      daFeedback.style.display = 'block';
    }
  });
}

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

// ================= SIDEBAR & TABS =================

function switchSidebarTab(tabName) {
  sideTabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) panel.classList.add('active');
}

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
if (emptyOpenMenuBtn) {
  emptyOpenMenuBtn.addEventListener('click', () => {
    openMobileSidebar();
  });
}
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

sideTabs.forEach(btn => {
  btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
});

// ================= SOCKET.IO & CHAT =================

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({
    query: { username: currentUser },
    auth: { token: currentAuthToken || '' }
  });

  socket.on('account-deleted', () => {
    forceLogoutToAuth('Session ended or account deleted.');
  });

  socket.on('social-data', (data) => {
    socialState = data;
    renderSocialLists();

    if (!activeFriend && data.friends.length >= 1) {
      selectFriend(data.friends[0].username);
    } else if (activeFriend) {
      const stillFriends = data.friends.some(f => f.username.toLowerCase() === activeFriend.toLowerCase());
      if (!stillFriends) {
        activeFriend = null;
        messagesList.innerHTML = '';
        emptyChatState.style.display = 'block';
        headerCallActions.style.display = 'none';
        if (heartShowerBtn) heartShowerBtn.disabled = true;
        headerTitle.textContent = 'MINI-WORLD';
        headerSubtitle.textContent = 'Waiting for your partner...';
      } else {
        updateActiveFriendHeader();
      }
    }
  });

  socket.on('private-chat-history', ({ friend, messages }) => {
    if (!activeFriend || friend.toLowerCase() !== activeFriend.toLowerCase()) return;
    messagesList.innerHTML = '';
    lastRenderedDateKey = null;
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });

  socket.on('private-message', (msg) => {
    const isMine = msg.username.toLowerCase() === currentUser.toLowerCase();
    const isRelevant =
      activeFriend &&
      ((isMine && msg.recipient.toLowerCase() === activeFriend.toLowerCase()) ||
       (msg.username.toLowerCase() === activeFriend.toLowerCase() && msg.recipient.toLowerCase() === currentUser.toLowerCase()));

    if (!isMine) {
      playMessageBeep();
      if (userSettings.vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(150);
      }
      if (document.hidden || !document.hasFocus()) {
        triggerBackgroundOSNotification(msg.username, msg.text, `chat-${msg.username}`);
      }
    }

    if (isRelevant) {
      appendMessage(msg);
      scrollToBottom();
      if (!isMine && !document.hidden && document.hasFocus()) {
        socket.emit('mark-seen', { friend: activeFriend });
      }
    }
  });

  socket.on('heart-shower', () => {
    spawnHeartShower(16);
  });

  socket.on('messages-seen', ({ by }) => {
    if (!activeFriend || by.toLowerCase() !== activeFriend.toLowerCase()) return;
    document.querySelectorAll('.seen-status').forEach(el => {
      el.textContent = '✓✓';
      el.classList.add('is-seen');
    });
  });

  socket.on('typing', ({ from }) => {
    if (activeFriend && from.toLowerCase() === activeFriend.toLowerCase()) {
      headerSubtitle.textContent = '💗 typing...';
      headerSubtitle.classList.add('typing-glow');
    }
  });

  socket.on('stop-typing', ({ from }) => {
    if (activeFriend && from.toLowerCase() === activeFriend.toLowerCase()) {
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
    if (activeFriend && friend.toLowerCase() === activeFriend.toLowerCase()) {
      messagesList.innerHTML = '';
      lastRenderedDateKey = null;
    }
  });

  socket.on('incoming-call', handleIncomingCall);
  socket.on('call-answered', handleCallAnswered);
  socket.on('ice-candidate', handleNewIceCandidate);
  socket.on('call-media-state', ({ micEnabled, camEnabled }) => {
    const states = [];
    if (micEnabled === false) states.push('Muted');
    if (camEnabled === false) states.push('Camera off');
    if (states.length > 0) {
      remoteStatusPill.textContent = states.join(' • ');
      remoteStatusPill.style.display = 'block';
    } else {
      remoteStatusPill.style.display = 'none';
    }
  });
  socket.on('call-rejected', () => {
    cleanupCallUI();
    showToast('Call declined.', 'error');
  });
  socket.on('call-ended', () => cleanupCallUI());
  socket.on('call-error', ({ message }) => {
    cleanupCallUI();
    showToast(message, 'error');
  });
}

window.addEventListener('focus', () => {
  if (activeFriend && socket) {
    socket.emit('mark-seen', { friend: activeFriend });
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeFriend && socket) {
    socket.emit('mark-seen', { friend: activeFriend });
  }
});

function formatLastSeen(isoTime) {
  if (!isoTime) return 'offline';
  const d = new Date(isoTime);
  if (isNaN(d.getTime())) return 'offline';
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) {
    return `last seen today at ${timeStr}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${timeStr}`;
  }
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${timeStr}`;
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

  if (badgeFind) {
    if (discover.length > 0) {
      badgeFind.style.display = 'inline-block';
      badgeFind.textContent = discover.length;
    } else {
      badgeFind.style.display = 'none';
    }
  }

  friendsListEl.innerHTML = '';
  if (friends.length === 0) {
    friendsListEl.innerHTML = `<div class="empty-list-msg">Waiting for your partner to join...</div>`;
  } else {
    friends.forEach(f => {
      const card = document.createElement('div');
      const isSelected = activeFriend && activeFriend.toLowerCase() === f.username.toLowerCase();
      card.className = `user-card ${isSelected ? 'active-chat' : ''}`;
      card.innerHTML = `
        <div class="user-card-left">
          <div class="avatar-circle small">${f.username.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-card-name">${escapeHTML(f.username)}</div>
            <div class="user-card-sub">
              <span class="${f.online ? 'dot-online' : 'dot-offline'}"></span>
              ${f.online ? '💗 Online' : formatLastSeen(f.last_seen)}
            </div>
          </div>
        </div>
        <div class="user-card-actions">
          ${f.unread > 0 ? `<span class="unread-pill">${f.unread}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        selectFriend(f.username);
        closeMobileSidebar();
      });

      friendsListEl.appendChild(card);
    });
  }

  requestsListEl.innerHTML = `<div class="empty-list-msg">Direct partner connection is active.</div>`;
  findListEl.innerHTML = `<div class="empty-list-msg">Private 2-Account Lock Active.</div>`;
}

// ================= CHAT & REPLY LOGIC =================

function selectFriend(friendName) {
  activeFriend = friendName;
  emptyChatState.style.display = 'none';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  if (heartShowerBtn) heartShowerBtn.disabled = false;
  messageInput.placeholder = `Message ${friendName}...`;

  clearReplyPreview();
  updateActiveFriendHeader();
  renderSocialLists();
  socket.emit('load-private-chat', { friend: friendName });
}

function updateActiveFriendHeader() {
  if (!activeFriend) return;
  const friendObj = socialState.friends.find(f => f.username.toLowerCase() === activeFriend.toLowerCase());
  const isOnline = friendObj ? friendObj.online : false;

  headerAvatar.textContent = activeFriend.charAt(0).toUpperCase();
  headerTitle.textContent = activeFriend;
  headerSubtitle.textContent = isOnline
    ? '💗 Online'
    : formatLastSeen(friendObj ? friendObj.last_seen : null);
  headerCallActions.style.display = 'flex';
}

function setReplyPreview(msg) {
  replyingToMessage = {
    id: msg.id,
    username: msg.username,
    text: msg.text
  };
  replyPreviewUser.textContent = msg.username.toLowerCase() === currentUser.toLowerCase() ? 'You' : msg.username;
  replyPreviewText.textContent = msg.text;
  replyPreviewBar.style.display = 'flex';
  messageInput.focus();
}

function clearReplyPreview() {
  replyingToMessage = null;
  if (replyPreviewBar) replyPreviewBar.style.display = 'none';
}

if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', clearReplyPreview);

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

  socket.emit('private-message', {
    to: activeFriend,
    text,
    replyTo: replyingToMessage
  });
  socket.emit('stop-typing', { to: activeFriend });
  messageInput.value = '';
  clearReplyPreview();
});

function getDateChipLabel(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function appendMessage(msg) {
  if (document.querySelector(`.msg-row[data-id="${msg.id}"]`)) return;

  const dateLabel = getDateChipLabel(msg.created_at);
  if (dateLabel && dateLabel !== lastRenderedDateKey) {
    lastRenderedDateKey = dateLabel;
    const sep = document.createElement('li');
    sep.className = 'date-divider';
    sep.innerHTML = `<span>${dateLabel}</span>`;
    messagesList.appendChild(sep);
  }

  const isMine = msg.username.toLowerCase() === currentUser.toLowerCase();
  const li = document.createElement('li');
  li.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;
  li.dataset.id = msg.id;

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const seenHTML = isMine
    ? `<span class="seen-status ${msg.seen ? 'is-seen' : ''}">${msg.seen ? '✓✓' : '✓'}</span>`
    : '';

  let replyObj = msg.reply_to;
  if (typeof replyObj === 'string') {
    try { replyObj = JSON.parse(replyObj); } catch (e) { replyObj = null; }
  }

  const quotedHTML = replyObj && replyObj.text
    ? `<div class="quoted-box">
         <span class="quoted-author">${escapeHTML(replyObj.username.toLowerCase() === currentUser.toLowerCase() ? 'You' : replyObj.username)}</span>
         <span class="quoted-text">${escapeHTML(replyObj.text)}</span>
       </div>`
    : '';

  li.innerHTML = `
    <div class="msg-bubble-wrap">
      <div class="msg-bubble">
        ${quotedHTML}
        <div class="msg-line">
          <span class="msg-text">${escapeHTML(msg.text)}</span>
          <span class="msg-inline-meta">
            <span>${time}</span>
            ${seenHTML}
          </span>
        </div>
        <span class="reaction-pill" style="display: ${msg.reaction ? 'inline-block' : 'none'};">${msg.reaction || ''}</span>
      </div>
    </div>
    <div class="msg-actions-bar">
      <button type="button" class="msg-action-btn reply-btn" title="Reply">↩</button>
      <button type="button" class="msg-action-btn react-btn" title="React">♡</button>
      ${isMine ? `<button type="button" class="msg-action-btn delete-msg-btn" title="Delete">✕</button>` : ''}
    </div>
  `;

  const bubbleEl = li.querySelector('.msg-bubble');

  const triggerReaction = () => {
    const burst = document.createElement('span');
    burst.className = 'double-tap-burst';
    burst.textContent = '❤️';
    bubbleEl.appendChild(burst);
    setTimeout(() => burst.remove(), 650);
    socket.emit('react-message', { id: msg.id, friend: activeFriend });
  };

  bubbleEl.addEventListener('dblclick', triggerReaction);
  li.querySelector('.react-btn').addEventListener('click', triggerReaction);
  li.querySelector('.reply-btn').addEventListener('click', () => setReplyPreview(msg));

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

// ================= WEBRTC AUDIO & VIDEO CALLING =================

localVideoWrap.addEventListener('click', () => {
  videoStage.classList.toggle('swapped-pip');
});

async function startCall(targetUser, videoEnabled) {
  const friendObj = socialState.friends.find(f => f.username.toLowerCase() === targetUser.toLowerCase());
  if (!friendObj || !friendObj.online) {
    showToast(`${targetUser} is offline right now.`, 'error');
    return;
  }

  currentCallPartner = targetUser;
  isCurrentCallVideo = videoEnabled;
  currentFacingMode = 'user';
  isSpeakerphone = videoEnabled;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: videoEnabled ? { facingMode: currentFacingMode } : false
    });
  } catch (err) {
    showToast('Microphone/camera permission is required for calling.', 'error');
    return;
  }

  outgoingCalleeAvatar.textContent = targetUser.charAt(0).toUpperCase();
  outgoingCalleeName.textContent = targetUser;
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

  clearTimeout(callRingTimeout);
  callRingTimeout = setTimeout(() => {
    if (outgoingOverlay.style.display !== 'none') {
      socket.emit('end-call', { to: targetUser });
      socket.emit('private-message', {
        to: targetUser,
        text: videoEnabled ? 'Missed video call' : 'Missed voice call'
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
  incomingCallerName.textContent = from;
  incomingCallType.textContent = isCurrentCallVideo ? 'Incoming video call' : 'Incoming voice call';
  incomingOverlay.style.display = 'flex';
  startCallTone('incoming');

  if (document.hidden || !document.hasFocus()) {
    triggerBackgroundOSNotification(
      `Incoming ${isCurrentCallVideo ? 'Video' : 'Voice'} Call`,
      `${from} is calling you`,
      'incoming-call'
    );
  }
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
    showToast('Microphone/camera permission denied.', 'error');
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

  socket.emit('make-answer', { to: currentCallPartner, answer });
  showActiveCallScreen();
});

declineCallBtn.addEventListener('click', () => {
  stopCallTone();
  if (currentCallPartner) socket.emit('reject-call', { to: currentCallPartner });
  cleanupCallUI();
});

cancelCallBtn.addEventListener('click', () => {
  stopCallTone();
  if (currentCallPartner) {
    socket.emit('end-call', { to: currentCallPartner });
    socket.emit('private-message', {
      to: currentCallPartner,
      text: isCurrentCallVideo ? 'Missed video call' : 'Missed voice call'
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
      socket.emit('ice-candidate', { to: partnerUsername, candidate: e.candidate });
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

async function applyAudioOutputMode() {
  toggleSpeakerBtn.textContent = isSpeakerphone ? '🔊' : '👂';
  toggleSpeakerBtn.classList.toggle('active-speaker', isSpeakerphone);
  audioModeLabel.textContent = isSpeakerphone ? 'Speaker' : 'Earpiece';
  videoStage.classList.toggle('earpiece-dim', !isSpeakerphone && !isCurrentCallVideo);
  remoteVideo.volume = isSpeakerphone ? 1.0 : 0.65;

  if (typeof remoteVideo.setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      if (outputs.length > 1) {
        const target = outputs.find(d =>
          isSpeakerphone ? /speaker/i.test(d.label) : /earpiece|receiver|communications|default/i.test(d.label)
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
    showToast('Unable to switch camera.', 'error');
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
  if (currentCallPartner) socket.emit('end-call', { to: currentCallPartner });
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