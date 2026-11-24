let socket = null;
let currentUser = null;
let currentAuthToken = localStorage.getItem('ps_token') || null;
let activeFriend = null;
let socialState = { friends: [], requests: [], discover: [] };
let typingTimeout = null;
let remoteTypingTimer = null;
let replyingToMessage = null;
let lastRenderedDateKey = null;
let toastTimer = null;
let swRegistration = null;

// ================= USER SETTINGS =================

const userSettings = {
  soundEnabled: localStorage.getItem('ps_sound') === 'true',
  vibrateEnabled: localStorage.getItem('ps_vibrate') !== 'false',
  autoLogin: localStorage.getItem('ps_autologin') !== 'false'
};

// ================= SHARED CUSTOM GAME SONGS STATE =================

let gameAudioMeta = { win: null, lose: null };
const gameSongPlayer = new Audio();
gameSongPlayer.preload = 'auto';
let gameSongStopTimer = null;
let previewObjectUrl = null;

// ================= GAME MODE, WATCH & DOODLE STATE =================

// 1. Tic-Tac-Toe State
let tttState = {
  board: Array(9).fill(null),
  turnUser: null,
  winnerUser: null,
  winnerSymbol: null,
  isDraw: false,
  symbols: {},
  scores: {},
  lastDare: null
};
let tttWinLine = [];
let tttMovePending = false;
let lastAnnouncedTttWinKey = null;

// 2. Mind Sync (Telepathy Test) State
const mindPrompts = [
  'Favorite street food to eat together?',
  'Dream vacation spot for both of us?',
  'Best late-night snack?',
  'Go-to comfort movie or show?',
  'Chai or Coffee on a rainy day?',
  'One word that describes our vibe?',
  'Who takes longer to get ready?',
  'First thing you would buy if we won 1 crore?',
  'Favorite ice cream flavor?',
  'Beach sunset or mountain sunrise?'
];
let mindState = {
  promptIndex: 0,
  customPrompt: null,
  answers: {},
  revealed: false,
  streak: 0,
  matched: false
};
let lastAnnouncedMindKey = null;

// 3. Emoji RPS State
const RPS_EMOJI_MAP = { rock: '✊', paper: '✋', scissors: '✌️' };
let rpsState = {
  round: 1,
  lockedUsers: [],
  myPick: null,
  scores: {},
  lastResult: null,
  matchWinner: null
};
let lastAnnouncedRpsRound = 0;

// 4. 30-Second Heart Catch Battle State
let catchState = {
  active: false,
  endTime: 0,
  scores: {},
  winnerUser: null
};
let catchSpawnInterval = null;
let catchTimerInterval = null;
let lastAnnouncedCatchEnd = 0;

// 5. Watch Together State
let ytVideoId = null;

// 6. Shared Doodle State
let doodleStrokes = [];
let doodleColor = '#38bdf8';
let doodleSize = 4;
let isDoodling = false;
let lastDoodlePos = null;
let doodleCtx = null;

// 7. Dudu-Bubu Cartoon Actions
const DUDU_ACTIONS = [
  { cls: 'action-bonk', label: '🐻 Bonk!', fx: '💥' },
  { cls: 'action-hug', label: '🫂 Hug!', fx: '💖' },
  { cls: 'action-chase', label: '🏃 Chase!', fx: '💨' },
  { cls: 'action-dance', label: '💃 Dance!', fx: '✨' }
];
let duduActionIndex = 0;
let duduAutoCycleInterval = null;

// ================= WEBRTC STATE =================

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

// ================= DOM ELEMENTS =================

// Romantic Stage, Kittens, Typing Pill, Toast & Confirm Modal
const heartShowerStage = document.getElementById('heart-shower-stage');
const cuteKittensStage = document.getElementById('cute-kittens-stage');
const liveTypingPill = document.getElementById('live-typing-pill');
const liveTypingText = document.getElementById('live-typing-text');
const appToast = document.getElementById('app-toast');
const appConfirmModal = document.getElementById('app-confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmOkBtn = document.getElementById('confirm-ok-btn');

// Game Mode Shell & Dudu-Bubu
const openGameModeBtn = document.getElementById('open-game-mode-btn');
const gameModeModal = document.getElementById('game-mode-modal');
const closeGameModeBtn = document.getElementById('close-game-mode-btn');
const stopGameAudioBtn = document.getElementById('stop-game-audio-btn');
const gameTabs = document.querySelectorAll('.game-tab');
const duduBubuStage = document.getElementById('dudu-bubu-stage');
const duduBubuFx = document.getElementById('dudu-bubu-fx');
const duduActionBtn = document.getElementById('dudu-action-btn');

// Game 1: Tic-Tac-Toe
const tttScoreMeLabel = document.getElementById('ttt-score-me-label');
const tttScoreMeEl = document.getElementById('ttt-score-me');
const tttScorePartnerLabel = document.getElementById('ttt-score-partner-label');
const tttScorePartnerEl = document.getElementById('ttt-score-partner');
const tttEmojiButtons = document.querySelectorAll('.emoji-choice-btn');
const tttRoleHint = document.getElementById('ttt-role-hint');
const tttStatusEl = document.getElementById('ttt-status');
const tttBoardEl = document.getElementById('ttt-board');
const tttDareCard = document.getElementById('ttt-dare-card');
const tttDareText = document.getElementById('ttt-dare-text');
const tttResetBtn = document.getElementById('ttt-reset-btn');
const tttResetScoresBtn = document.getElementById('ttt-reset-scores-btn');

// Game 2: Mind Sync
const mindStreakBadge = document.getElementById('mind-streak-badge');
const mindPromptText = document.getElementById('mind-prompt-text');
const mindForm = document.getElementById('mind-form');
const mindAnswerInput = document.getElementById('mind-answer-input');
const mindLockBtn = document.getElementById('mind-lock-btn');
const mindStatusText = document.getElementById('mind-status-text');
const mindRevealArea = document.getElementById('mind-reveal-area');
const mindCustomPromptInput = document.getElementById('mind-custom-prompt-input');
const mindCustomSendBtn = document.getElementById('mind-custom-send-btn');
const mindNextBtn = document.getElementById('mind-next-btn');

// Game 3: Emoji RPS
const rpsMeLabel = document.getElementById('rps-me-label');
const rpsScoreMeEl = document.getElementById('rps-score-me');
const rpsRoundLabel = document.getElementById('rps-round-label');
const rpsPartnerLabel = document.getElementById('rps-partner-label');
const rpsScorePartnerEl = document.getElementById('rps-score-partner');
const rpsArenaMe = document.getElementById('rps-arena-me');
const rpsArenaPartner = document.getElementById('rps-arena-partner');
const rpsPartnerNameEl = document.getElementById('rps-partner-name');
const rpsResultBanner = document.getElementById('rps-result-banner');
const rpsMoveButtons = document.querySelectorAll('.rps-move-btn');
const rpsResetBtn = document.getElementById('rps-reset-btn');

// Game 4: Heart Catch Battle
const catchScoreMeEl = document.getElementById('catch-score-me');
const catchTimerEl = document.getElementById('catch-timer');
const catchPartnerLabel = document.getElementById('catch-partner-label');
const catchScorePartnerEl = document.getElementById('catch-score-partner');
const catchArena = document.getElementById('catch-arena');
const catchOverlay = document.getElementById('catch-overlay');
const catchStatusMsg = document.getElementById('catch-status-msg');
const catchStartBtn = document.getElementById('catch-start-btn');

// Game 5: Watch Together + Live Reactions
const ytLoadForm = document.getElementById('yt-load-form');
const ytUrlInput = document.getElementById('yt-url-input');
const ytEmptyMsg = document.getElementById('yt-empty-msg');
const ytIframe = document.getElementById('yt-iframe');
const watchReactionStage = document.getElementById('watch-reaction-stage');
const watchReactButtons = document.querySelectorAll('.watch-react-btn');

// Game 6: Shared Live Doodle Canvas
const doodleCanvas = document.getElementById('doodle-canvas');
const doodleColorButtons = document.querySelectorAll('.doodle-color-btn');
const doodleSizeInput = document.getElementById('doodle-size');
const doodleClearBtn = document.getElementById('doodle-clear-btn');

// Auth Elements
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

// Sidebar & Chat Header
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

// Settings Modal Elements
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const toggleSoundCheckbox = document.getElementById('toggle-sound');
const toggleVibrateCheckbox = document.getElementById('toggle-vibrate');
const toggleAutologinCheckbox = document.getElementById('toggle-autologin');
const gameAudioFeedback = document.getElementById('game-audio-feedback');
const winSongStatus = document.getElementById('win-song-status');
const winSongFileInput = document.getElementById('win-song-file');
const winSongStartInput = document.getElementById('win-song-start');
const uploadWinSongBtn = document.getElementById('upload-win-song-btn');
const testWinSongBtn = document.getElementById('test-win-song-btn');
const clearWinSongBtn = document.getElementById('clear-win-song-btn');
const loseSongStatus = document.getElementById('lose-song-status');
const loseSongFileInput = document.getElementById('lose-song-file');
const loseSongStartInput = document.getElementById('lose-song-start');
const uploadLoseSongBtn = document.getElementById('upload-lose-song-btn');
const testLoseSongBtn = document.getElementById('test-lose-song-btn');
const clearLoseSongBtn = document.getElementById('clear-lose-song-btn');
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

// Calling Elements
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

// Unlock Web Audio on first user touch/click (required on mobile browsers)
['click', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }, { passive: true });
});

// ================= MOBILE KEYBOARD VIEWPORT SYNC =================

function syncMobileViewportHeight() {
  if (window.visualViewport) {
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
    const isKeyboardVisible = window.innerHeight - vv.height > 120;
    document.body.classList.toggle('keyboard-open', isKeyboardVisible);
    if (isKeyboardVisible) {
      setTimeout(scrollToBottom, 80);
    }
  } else {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncMobileViewportHeight);
  window.visualViewport.addEventListener('scroll', syncMobileViewportHeight);
}
window.addEventListener('resize', () => {
  syncMobileViewportHeight();
  resizeDoodleCanvas();
});

window.addEventListener('DOMContentLoaded', () => {
  syncMobileViewportHeight();
  initRomanticBackgroundCanvas();
  initGameModeCanvas();
  initDoodleCanvas();
  applyDuduAction(0);
  renderGameAudioSettings();
  renderTicTacToe();
  renderMindSync();
  renderRps();
  renderCatchGame();

  const savedUser = localStorage.getItem('ps_username');
  const savedToken = localStorage.getItem('ps_token');
  if (userSettings.autoLogin && savedUser && savedToken) {
    enterApp(savedUser, savedToken);
  }
});

// ================= SHARED CUSTOM GAME SONGS & FALLBACK SOUNDS =================

function showGameAudioFeedback(msg, type = 'success') {
  if (!gameAudioFeedback) return;
  gameAudioFeedback.textContent = msg;
  gameAudioFeedback.className = `auth-feedback ${type}`;
  gameAudioFeedback.style.display = 'block';
}

function renderGameAudioSettings() {
  if (winSongStatus) {
    if (gameAudioMeta.win) {
      winSongStatus.textContent = `🎵 ${gameAudioMeta.win.name} (from ${gameAudioMeta.win.startSec || 0}s • set by ${gameAudioMeta.win.setBy})`;
      if (winSongStartInput && !winSongStartInput.matches(':focus')) {
        winSongStartInput.value = gameAudioMeta.win.startSec || 0;
      }
    } else {
      winSongStatus.textContent = 'Default victory fanfare';
    }
  }

  if (loseSongStatus) {
    if (gameAudioMeta.lose) {
      loseSongStatus.textContent = `🎵 ${gameAudioMeta.lose.name} (from ${gameAudioMeta.lose.startSec || 0}s • set by ${gameAudioMeta.lose.setBy})`;
      if (loseSongStartInput && !loseSongStartInput.matches(':focus')) {
        loseSongStartInput.value = gameAudioMeta.lose.startSec || 0;
      }
    } else if (gameAudioMeta.win) {
      loseSongStatus.textContent = `Shared Win Song will play (${gameAudioMeta.win.name})`;
    } else {
      loseSongStatus.textContent = 'Default funny sad trombone';
    }
  }
}

function stopGameSong() {
  clearTimeout(gameSongStopTimer);
  gameSongStopTimer = null;
  try {
    gameSongPlayer.pause();
    gameSongPlayer.currentTime = 0;
  } catch (e) {}
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  if (stopGameAudioBtn) {
    stopGameAudioBtn.style.display = 'none';
  }
}

gameSongPlayer.addEventListener('ended', stopGameSong);

if (stopGameAudioBtn) {
  stopGameAudioBtn.addEventListener('click', stopGameSong);
}

function startAudioElementFromSec(srcUrl, startSec = 0) {
  stopGameSong();
  const safeStart = Math.max(0, Number(startSec) || 0);

  gameSongPlayer.src = srcUrl;
  gameSongPlayer.volume = 0.9;

  const beginPlayback = () => {
    try {
      if (safeStart > 0 && (!isFinite(gameSongPlayer.duration) || safeStart < gameSongPlayer.duration)) {
        gameSongPlayer.currentTime = safeStart;
      }
    } catch (e) {}

    const playPromise = gameSongPlayer.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          if (stopGameAudioBtn) stopGameAudioBtn.style.display = 'inline-block';
          // Auto-stop after 12 seconds so it feels like a crisp game celebration clip
          gameSongStopTimer = setTimeout(stopGameSong, 12000);
        })
        .catch(() => {
          showToast('Tap anywhere once to allow game song playback.', 'info');
        });
    }
  };

  gameSongPlayer.onloadedmetadata = () => {
    gameSongPlayer.onloadedmetadata = null;
    beginPlayback();
  };
  gameSongPlayer.load();
}

function playSyncedGameSong(type) {
  const meta = gameAudioMeta[type];
  if (!meta || !currentUser || !currentAuthToken) return false;
  const streamUrl = `/game-audio/${type}?u=${encodeURIComponent(currentUser)}&t=${encodeURIComponent(currentAuthToken)}&v=${meta.updatedAt || 0}`;
  startAudioElementFromSec(streamUrl, meta.startSec || 0);
  return true;
}

async function handleSaveGameSong(type) {
  const fileInput = type === 'win' ? winSongFileInput : loseSongFileInput;
  const startInput = type === 'win' ? winSongStartInput : loseSongStartInput;
  const saveBtn = type === 'win' ? uploadWinSongBtn : uploadLoseSongBtn;

  if (!currentUser || !currentAuthToken) return;
  if (gameAudioFeedback) gameAudioFeedback.style.display = 'none';

  const startSec = Math.max(0, Math.min(3600, Number(startInput?.value) || 0));
  const file = fileInput?.files?.[0];

  // If no new file chosen, update only startSec for the already-uploaded song
  if (!file) {
    if (!gameAudioMeta[type]) {
      showGameAudioFeedback('Please select an MP3 or audio file first.', 'error');
      return;
    }
    try {
      if (saveBtn) saveBtn.disabled = true;
      const res = await fetch(`/game-audio-meta/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': currentAuthToken
        },
        body: JSON.stringify({ username: currentUser, token: currentAuthToken, startSec })
      });
      const data = await res.json();
      if (!res.ok) {
        showGameAudioFeedback(data.error || 'Could not update start time.', 'error');
        return;
      }
      if (data.audio) gameAudioMeta = data.audio;
      renderGameAudioSettings();
      showGameAudioFeedback('Start time updated for both players!', 'success');
    } catch (err) {
      showGameAudioFeedback('Network error updating start time.', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showGameAudioFeedback('File is too big! Please pick an audio clip under 5 MB.', 'error');
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '...';
    }
    const res = await fetch(`/game-audio/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'audio/mpeg',
        'x-auth-user': encodeURIComponent(currentUser),
        'x-auth-token': currentAuthToken,
        'x-audio-name': encodeURIComponent(file.name),
        'x-audio-start': String(startSec)
      },
      body: file
    });
    const data = await res.json();
    if (!res.ok) {
      showGameAudioFeedback(data.error || 'Failed to upload song.', 'error');
      return;
    }
    if (data.audio) gameAudioMeta = data.audio;
    fileInput.value = '';
    renderGameAudioSettings();
    showGameAudioFeedback(`${type === 'win' ? 'Win' : 'Lose'} Song saved! Both players will hear it.`, 'success');
  } catch (err) {
    showGameAudioFeedback('Upload error. Try a smaller MP3 file.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }
}

function handlePreviewGameSong(type) {
  const fileInput = type === 'win' ? winSongFileInput : loseSongFileInput;
  const startInput = type === 'win' ? winSongStartInput : loseSongStartInput;
  const localFile = fileInput?.files?.[0];
  const startSec = Math.max(0, Number(startInput?.value) || 0);

  if (localFile) {
    stopGameSong();
    previewObjectUrl = URL.createObjectURL(localFile);
    startAudioElementFromSec(previewObjectUrl, startSec);
    return;
  }

  if (gameAudioMeta[type]) {
    playSyncedGameSong(type);
    return;
  }

  if (type === 'win') {
    playRetroWinFanfare();
  } else {
    playFunnySadTrombone();
  }
}

async function handleClearGameSong(type) {
  if (!currentUser || !currentAuthToken) return;
  stopGameSong();
  const fileInput = type === 'win' ? winSongFileInput : loseSongFileInput;
  if (fileInput) fileInput.value = '';

  if (!gameAudioMeta[type]) {
    showGameAudioFeedback('Already using default sound.', 'success');
    return;
  }

  try {
    const res = await fetch(`/game-audio/${type}`, {
      method: 'DELETE',
      headers: {
        'x-auth-user': encodeURIComponent(currentUser),
        'x-auth-token': currentAuthToken
      }
    });
    const data = await res.json();
    if (!res.ok) {
      showGameAudioFeedback(data.error || 'Could not remove song.', 'error');
      return;
    }
    if (data.audio) gameAudioMeta = data.audio;
    renderGameAudioSettings();
    showGameAudioFeedback('Song removed. Reverted to default sound.', 'success');
  } catch (err) {
    showGameAudioFeedback('Network error removing song.', 'error');
  }
}

if (uploadWinSongBtn) uploadWinSongBtn.addEventListener('click', () => handleSaveGameSong('win'));
if (testWinSongBtn) testWinSongBtn.addEventListener('click', () => handlePreviewGameSong('win'));
if (clearWinSongBtn) clearWinSongBtn.addEventListener('click', () => handleClearGameSong('win'));

if (uploadLoseSongBtn) uploadLoseSongBtn.addEventListener('click', () => handleSaveGameSong('lose'));
if (testLoseSongBtn) testLoseSongBtn.addEventListener('click', () => handlePreviewGameSong('lose'));
if (clearLoseSongBtn) clearLoseSongBtn.addEventListener('click', () => handleClearGameSong('lose'));

function playRetroWinFanfare() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const startAt = ctx.currentTime + idx * 0.09;
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.18, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.26);
    });
  } catch (e) {}
}

function playFunnySadTrombone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [
      { freq: 311.13, dur: 0.24, delay: 0.0 },
      { freq: 293.66, dur: 0.24, delay: 0.25 },
      { freq: 277.18, dur: 0.24, delay: 0.5 },
      { freq: 261.63, dur: 0.58, delay: 0.75, slideTo: 233.08 }
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const startAt = ctx.currentTime + n.delay;
      osc.frequency.setValueAtTime(n.freq, startAt);
      if (n.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(n.slideTo, startAt + n.dur);
      }
      gain.gain.setValueAtTime(0.12, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + n.dur + 0.02);
    });
  } catch (e) {}
}

function triggerGameOutcomeSound(didWin) {
  if (didWin) {
    spawnHeartShower(18);
    applyDuduAction(3); // Happy Dance!
    if (!playSyncedGameSong('win')) {
      playRetroWinFanfare();
    }
  } else {
    applyDuduAction(0); // Playful Bonk!
    // If Lose Song is set, play Lose Song; else if Win Song is set, play Win Song so both hear it; else sad trombone
    if (!playSyncedGameSong('lose')) {
      if (!playSyncedGameSong('win')) {
        playFunnySadTrombone();
      }
    }
  }
}

// ================= DUDU-BUBU BACKGROUND ACTION CONTROLLER =================

function applyDuduAction(index) {
  if (!duduBubuStage) return;
  duduActionIndex = index % DUDU_ACTIONS.length;
  const act = DUDU_ACTIONS[duduActionIndex];
  duduBubuStage.className = `dudu-bubu-stage ${act.cls}`;
  if (duduBubuFx) duduBubuFx.textContent = act.fx;
  if (duduActionBtn) duduActionBtn.textContent = act.label;
}

if (duduActionBtn) {
  duduActionBtn.addEventListener('click', () => {
    applyDuduAction(duduActionIndex + 1);
  });
}

function startDuduAutoCycle() {
  stopDuduAutoCycle();
  duduAutoCycleInterval = setInterval(() => {
    if (isGameModeOpen() && !document.hidden) {
      applyDuduAction(duduActionIndex + 1);
    }
  }, 9000);
}

function stopDuduAutoCycle() {
  if (duduAutoCycleInterval) {
    clearInterval(duduAutoCycleInterval);
    duduAutoCycleInterval = null;
  }
}

// ================= GAME MODE SHELL & TAB NAVIGATION =================

function isGameModeOpen() {
  return Boolean(gameModeModal && gameModeModal.style.display !== 'none');
}

function pauseYouTubeIframe() {
  if (!ytIframe || !ytIframe.contentWindow || !ytVideoId) return;
  try {
    ytIframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
      '*'
    );
  } catch (e) {}
}

if (openGameModeBtn) {
  openGameModeBtn.addEventListener('click', () => {
    if (!activeFriend) {
      showToast('Connect with your partner first.', 'error');
      return;
    }
    renderTicTacToe();
    renderMindSync();
    renderRps();
    renderCatchGame();
    gameModeModal.style.display = 'flex';
    startDuduAutoCycle();
    setTimeout(resizeDoodleCanvas, 60);
  });
}

if (closeGameModeBtn) {
  closeGameModeBtn.addEventListener('click', () => {
    pauseYouTubeIframe();
    stopGameSong();
    stopDuduAutoCycle();
    gameModeModal.style.display = 'none';
  });
}

gameTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    gameTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.gtab;
    if (target !== 'watch') pauseYouTubeIframe();
    document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`gtab-${target}`);
    if (panel) panel.classList.add('active');
    if (target === 'doodle') {
      setTimeout(resizeDoodleCanvas, 40);
    }
  });
});

// ================= GAME 1: UPGRADED TIC-TAC-TOE =================

function getWinningLine(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return { winner: null, line: [] };
}

function getTTTPlayerSymbols() {
  const me = (currentUser || '').toLowerCase();
  const partner = (activeFriend || '').toLowerCase();
  const defaultFirst = me && partner ? (me < partner ? '❤️' : '✨') : '❤️';
  const defaultSecond = defaultFirst === '❤️' ? '✨' : '❤️';
  const mySymbol = tttState.symbols?.[me] || defaultFirst;
  const partnerSymbol = tttState.symbols?.[partner] || defaultSecond;
  return { me, partner, mySymbol, partnerSymbol };
}

tttEmojiButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const symbol = btn.dataset.emoji;
    if (!symbol || !activeFriend || !socket) return;
    socket.emit('ttt-set-symbol', { to: activeFriend, symbol });
  });
});

function renderTicTacToe() {
  if (!tttBoardEl || !tttStatusEl) return;
  const { me, partner, mySymbol, partnerSymbol } = getTTTPlayerSymbols();
  const scores = tttState.scores || {};

  if (tttScoreMeLabel) tttScoreMeLabel.textContent = `You (${mySymbol})`;
  if (tttScorePartnerLabel) tttScorePartnerLabel.textContent = `${activeFriend || 'Partner'} (${partnerSymbol})`;
  if (tttScoreMeEl) tttScoreMeEl.textContent = String(scores[me] || 0);
  if (tttScorePartnerEl) tttScorePartnerEl.textContent = String(scores[partner] || 0);

  tttEmojiButtons.forEach(btn => {
    const e = btn.dataset.emoji;
    btn.classList.toggle('active', e === mySymbol);
    btn.classList.toggle('taken', e === partnerSymbol);
    btn.disabled = e === partnerSymbol;
  });

  const turnUser = tttState.turnUser || (me < partner ? me : partner);
  const isMyTurn = !tttState.winnerUser && !tttState.isDraw && turnUser === me;
  const turnSym = turnUser === me ? mySymbol : partnerSymbol;

  if (tttRoleHint) {
    tttRoleHint.textContent = `You: ${mySymbol} • ${activeFriend || 'Partner'}: ${partnerSymbol}`;
  }

  if (tttState.winnerUser) {
    const wonByMe = tttState.winnerUser === me;
    tttStatusEl.textContent = wonByMe
      ? `🎉 You (${mySymbol}) won the round!`
      : `😜 ${activeFriend || 'Partner'} (${partnerSymbol}) won!`;

    if (tttDareCard && tttDareText && tttState.lastDare) {
      tttDareText.textContent = tttState.lastDare;
      tttDareCard.style.display = 'block';
    }

    const winKey = `${tttState.winnerUser}-${(tttState.board || []).join('')}-${scores[tttState.winnerUser] || 0}`;
    if (lastAnnouncedTttWinKey !== winKey) {
      lastAnnouncedTttWinKey = winKey;
      triggerGameOutcomeSound(wonByMe);
    }
  } else if (tttState.isDraw) {
    tttStatusEl.textContent = '🤝 Draw match — tap New Round!';
    if (tttDareCard) tttDareCard.style.display = 'none';
  } else {
    tttStatusEl.textContent = isMyTurn
      ? `Your turn (${mySymbol})`
      : `Waiting for ${activeFriend || 'partner'} (${turnSym})...`;
    if (tttDareCard) tttDareCard.style.display = 'none';
  }

  tttBoardEl.innerHTML = '';
  const board = Array.isArray(tttState.board) ? tttState.board : Array(9).fill(null);
  board.forEach((cell, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttt-cell';
    if (tttWinLine.includes(idx)) btn.classList.add('win-cell');
    btn.textContent = cell || '';
    btn.disabled = Boolean(cell || tttState.winnerUser || tttState.isDraw || !isMyTurn || tttMovePending);

    btn.addEventListener('click', () => {
      if (cell || tttState.winnerUser || tttState.isDraw || !isMyTurn || tttMovePending || !activeFriend || !socket) return;
      tttMovePending = true;
      socket.emit('ttt-move', { to: activeFriend, index: idx });
      setTimeout(() => { tttMovePending = false; }, 600);
    });
    tttBoardEl.appendChild(btn);
  });
}

if (tttResetBtn) {
  tttResetBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    stopGameSong();
    socket.emit('ttt-reset', { to: activeFriend, resetScores: false });
  });
}

if (tttResetScoresBtn) {
  tttResetScoresBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    stopGameSong();
    socket.emit('ttt-reset', { to: activeFriend, resetScores: true });
  });
}

// ================= GAME 2: MIND SYNC (TELEPATHY TEST) =================

function renderMindSync() {
  if (!mindPromptText || !mindStatusText || !mindRevealArea) return;
  const me = (currentUser || '').toLowerCase();
  const partner = (activeFriend || '').toLowerCase();

  const promptStr = mindState.customPrompt || mindPrompts[mindState.promptIndex % mindPrompts.length];
  mindPromptText.textContent = promptStr;
  if (mindStreakBadge) {
    mindStreakBadge.textContent = `🔥 Telepathy Streak: ${mindState.streak || 0}`;
  }

  const myAns = mindState.answers?.[me];
  const partnerAns = mindState.answers?.[partner];

  if (mindAnswerInput) {
    mindAnswerInput.disabled = Boolean(myAns || mindState.revealed);
  }
  if (mindLockBtn) {
    mindLockBtn.disabled = Boolean(myAns || mindState.revealed);
    mindLockBtn.textContent = myAns ? 'Locked ✓' : 'Lock 🔒';
  }

  mindRevealArea.innerHTML = '';

  if (mindState.revealed) {
    const myCard = document.createElement('div');
    myCard.className = `mind-reveal-card ${mindState.matched ? 'matched' : ''}`;
    myCard.innerHTML = `<small>You wrote</small><strong>${escapeHTML(myAns?.text || '—')}</strong>`;

    const partnerCard = document.createElement('div');
    partnerCard.className = `mind-reveal-card ${mindState.matched ? 'matched' : ''}`;
    partnerCard.innerHTML = `<small>${escapeHTML(activeFriend || 'Partner')} wrote</small><strong>${escapeHTML(partnerAns?.text || '—')}</strong>`;

    mindRevealArea.appendChild(myCard);
    mindRevealArea.appendChild(partnerCard);

    mindStatusText.textContent = mindState.matched
      ? '💖 SOULMATE SYNC! Same vibe unlocked!'
      : '😂 Different answers — debate time!';

    const revealKey = `${mindState.promptIndex}-${mindState.customPrompt || ''}-${myAns?.text}-${partnerAns?.text}`;
    if (lastAnnouncedMindKey !== revealKey) {
      lastAnnouncedMindKey = revealKey;
      triggerGameOutcomeSound(Boolean(mindState.matched));
    }
  } else if (myAns && !partnerAns) {
    mindStatusText.textContent = `Your answer is locked 🔒 — waiting for ${activeFriend || 'partner'}...`;
  } else if (!myAns && partnerAns) {
    mindStatusText.textContent = `${activeFriend || 'Partner'} locked an answer! Your turn 👇`;
  } else {
    mindStatusText.textContent = 'Type your secret answer and lock it in!';
  }
}

if (mindForm) {
  mindForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeFriend || !socket) return;
    const text = (mindAnswerInput?.value || '').trim();
    if (!text) return;
    socket.emit('mind-submit', { to: activeFriend, text });
    mindAnswerInput.value = '';
  });
}

if (mindCustomSendBtn) {
  mindCustomSendBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    const custom = (mindCustomPromptInput?.value || '').trim();
    if (!custom) return;
    stopGameSong();
    socket.emit('mind-next', { to: activeFriend, customPrompt: custom });
    mindCustomPromptInput.value = '';
  });
}

if (mindNextBtn) {
  mindNextBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    stopGameSong();
    const nextIdx = (mindState.promptIndex + 1) % mindPrompts.length;
    socket.emit('mind-next', { to: activeFriend, promptIndex: nextIdx });
  });
}

// ================= GAME 3: EMOJI ROCK-PAPER-SCISSORS (BEST OF 5) =================

function renderRps() {
  if (!rpsResultBanner || !rpsArenaMe || !rpsArenaPartner) return;
  const me = (currentUser || '').toLowerCase();
  const partner = (activeFriend || '').toLowerCase();
  const scores = rpsState.scores || {};

  if (rpsMeLabel) rpsMeLabel.textContent = 'You';
  if (rpsPartnerLabel) rpsPartnerLabel.textContent = activeFriend || 'Partner';
  if (rpsPartnerNameEl) rpsPartnerNameEl.textContent = activeFriend || 'Partner';
  if (rpsScoreMeEl) rpsScoreMeEl.textContent = String(scores[me] || 0);
  if (rpsScorePartnerEl) rpsScorePartnerEl.textContent = String(scores[partner] || 0);
  if (rpsRoundLabel) rpsRoundLabel.textContent = `Round ${rpsState.round || 1}`;

  const locked = Array.isArray(rpsState.lockedUsers) ? rpsState.lockedUsers : [];
  const iLocked = Boolean(rpsState.myPick);
  const partnerLocked = locked.includes(partner);

  rpsMoveButtons.forEach(btn => {
    const move = btn.dataset.move;
    btn.classList.toggle('selected', rpsState.myPick === move);
    btn.disabled = Boolean(rpsState.matchWinner);
  });

  if (iLocked) {
    rpsArenaMe.textContent = RPS_EMOJI_MAP[rpsState.myPick] || '✊';
    rpsArenaMe.classList.add('shaking');
    rpsArenaPartner.textContent = partnerLocked ? '🔒' : '⏳';
    rpsArenaPartner.classList.toggle('shaking', partnerLocked);
    rpsResultBanner.textContent = `Move locked! Waiting for ${activeFriend || 'partner'}...`;
  } else if (rpsState.lastResult) {
    const picks = rpsState.lastResult.picks || {};
    rpsArenaMe.textContent = RPS_EMOJI_MAP[picks[me]] || '❓';
    rpsArenaPartner.textContent = RPS_EMOJI_MAP[picks[partner]] || '❓';
    rpsArenaMe.classList.remove('shaking');
    rpsArenaPartner.classList.remove('shaking');
    rpsResultBanner.textContent = rpsState.lastResult.text || 'Round complete!';

    if (rpsState.round !== lastAnnouncedRpsRound) {
      lastAnnouncedRpsRound = rpsState.round;
      if (rpsState.matchWinner) {
        triggerGameOutcomeSound(rpsState.matchWinner === me);
      } else if (rpsState.lastResult.winnerUser) {
        if (rpsState.lastResult.winnerUser === me) {
          playRetroWinFanfare();
        } else {
          playFunnySadTrombone();
        }
      }
    }
  } else {
    rpsArenaMe.textContent = '❓';
    rpsArenaPartner.textContent = partnerLocked ? '🔒' : '❓';
    rpsArenaMe.classList.remove('shaking');
    rpsArenaPartner.classList.toggle('shaking', partnerLocked);
    rpsResultBanner.textContent = partnerLocked
      ? `${activeFriend || 'Partner'} picked! Choose your move 👇`
      : 'Choose Rock, Paper, or Scissors';
  }
}

rpsMoveButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!activeFriend || !socket || rpsState.matchWinner) return;
    socket.emit('rps-pick', { to: activeFriend, move: btn.dataset.move });
  });
});

if (rpsResetBtn) {
  rpsResetBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    stopGameSong();
    lastAnnouncedRpsRound = 0;
    socket.emit('rps-reset', { to: activeFriend });
  });
}

// ================= GAME 4: 30-SECOND HEART CATCH BATTLE =================

function stopCatchBattleLoops() {
  if (catchSpawnInterval) {
    clearInterval(catchSpawnInterval);
    catchSpawnInterval = null;
  }
  if (catchTimerInterval) {
    clearInterval(catchTimerInterval);
    catchTimerInterval = null;
  }
  if (catchArena) {
    catchArena.querySelectorAll('.catch-target, .catch-pop-score').forEach(el => el.remove());
  }
}

function spawnCatchTarget() {
  if (!catchArena || !catchState.active) return;
  const maxX = Math.max(20, catchArena.clientWidth - 60);
  const maxY = Math.max(20, catchArena.clientHeight - 60);

  const roll = Math.random();
  let item = { emoji: '💖', delta: 1, color: '#f472b6' };
  if (roll > 0.82) {
    item = { emoji: '🌶️', delta: -1, color: '#ef4444' };
  } else if (roll > 0.66) {
    item = { emoji: '🌟', delta: 2, color: '#fde047' };
  } else if (roll > 0.35) {
    item = { emoji: '🐱', delta: 1, color: '#7dd3fc' };
  }

  const target = document.createElement('button');
  target.type = 'button';
  target.className = 'catch-target';
  target.textContent = item.emoji;
  target.style.left = `${8 + Math.random() * maxX}px`;
  target.style.top = `${8 + Math.random() * maxY}px`;

  const removeTimer = setTimeout(() => target.remove(), 1350);

  const handleTap = (e) => {
    e.preventDefault();
    clearTimeout(removeTimer);
    if (!catchState.active || !activeFriend || !socket) return;

    const pop = document.createElement('span');
    pop.className = 'catch-pop-score';
    pop.textContent = item.delta > 0 ? `+${item.delta}` : `${item.delta}`;
    pop.style.color = item.color;
    pop.style.left = target.style.left;
    pop.style.top = target.style.top;
    catchArena.appendChild(pop);
    setTimeout(() => pop.remove(), 600);

    target.remove();
    socket.emit('catch-score', { to: activeFriend, delta: item.delta });
  };

  target.addEventListener('pointerdown', handleTap);
  catchArena.appendChild(target);
}

function renderCatchGame() {
  if (!catchScoreMeEl || !catchScorePartnerEl || !catchTimerEl || !catchOverlay) return;
  const me = (currentUser || '').toLowerCase();
  const partner = (activeFriend || '').toLowerCase();
  const scores = catchState.scores || {};

  if (catchPartnerLabel) catchPartnerLabel.textContent = activeFriend || 'Partner';
  catchScoreMeEl.textContent = String(scores[me] || 0);
  catchScorePartnerEl.textContent = String(scores[partner] || 0);

  if (catchState.active) {
    catchOverlay.style.display = 'none';
    if (!catchSpawnInterval) {
      catchSpawnInterval = setInterval(spawnCatchTarget, 620);
      spawnCatchTarget();
    }
    if (!catchTimerInterval) {
      catchTimerInterval = setInterval(() => {
        const left = Math.max(0, Math.ceil((catchState.endTime - Date.now()) / 1000));
        catchTimerEl.textContent = String(left);
        if (left <= 0) {
          stopCatchBattleLoops();
        }
      }, 250);
    }
  } else {
    stopCatchBattleLoops();
    catchTimerEl.textContent = '30';
    catchOverlay.style.display = 'flex';

    if (catchState.winnerUser) {
      if (catchState.winnerUser === 'draw') {
        catchStatusMsg.textContent = `🤝 It's a tie (${scores[me] || 0} - ${scores[partner] || 0})!`;
      } else {
        const didWin = catchState.winnerUser === me;
        catchStatusMsg.textContent = didWin
          ? `🏆 You won ${scores[me] || 0} - ${scores[partner] || 0}!`
          : `😜 ${activeFriend || 'Partner'} won ${scores[partner] || 0} - ${scores[me] || 0}!`;

        if (catchState.endTime && catchState.endTime !== lastAnnouncedCatchEnd) {
          lastAnnouncedCatchEnd = catchState.endTime;
          triggerGameOutcomeSound(didWin);
        }
      }
      if (catchStartBtn) catchStartBtn.textContent = 'Play Again 🚀';
    } else {
      catchStatusMsg.textContent = 'Ready for a 30-second reflex battle?';
      if (catchStartBtn) catchStartBtn.textContent = 'Start Battle 🚀';
    }
  }
}

if (catchStartBtn) {
  catchStartBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    stopGameSong();
    socket.emit('catch-start', { to: activeFriend });
  });
}

// ================= GAME 5: WATCH TOGETHER + LIVE REACTIONS =================

function extractYouTubeId(rawInput) {
  const val = String(rawInput || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(val)) return val;
  const match = val.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function applyYouTubeVideo(videoId) {
  if (!videoId) return;
  ytVideoId = videoId;
  if (ytEmptyMsg) ytEmptyMsg.style.display = 'none';
  if (ytIframe) {
    ytIframe.style.display = 'block';
    const nextSrc = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&rel=0`;
    if (ytIframe.src !== nextSrc) {
      ytIframe.src = nextSrc;
    }
  }
}

function spawnWatchReaction(emoji) {
  if (!watchReactionStage) return;
  const el = document.createElement('span');
  el.className = 'watch-flying-emoji';
  el.textContent = emoji;
  el.style.left = `${12 + Math.random() * 76}%`;
  el.style.setProperty('--drift', `${(Math.random() - 0.5) * 70}px`);
  watchReactionStage.appendChild(el);
  setTimeout(() => el.remove(), 2250);
}

if (ytLoadForm) {
  ytLoadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeFriend || !socket) return;
    const vid = extractYouTubeId(ytUrlInput.value);
    if (!vid) {
      showToast('Enter a valid YouTube link or 11-character video ID.', 'error');
      return;
    }
    socket.emit('yt-sync', { to: activeFriend, videoId: vid, action: 'load', timeSec: 0 });
    ytUrlInput.value = '';
  });
}

watchReactButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    if (!emoji || !activeFriend || !socket) return;
    socket.emit('watch-reaction', { to: activeFriend, emoji });
  });
});

// ================= GAME 6: SHARED LIVE DOODLE CANVAS =================

function drawDoodleSegment(seg) {
  if (!doodleCtx || !doodleCanvas || !doodleCanvas.width || !doodleCanvas.height) return;
  const w = doodleCanvas.width;
  const h = doodleCanvas.height;
  doodleCtx.save();
  doodleCtx.beginPath();
  doodleCtx.moveTo(seg.x0 * w, seg.y0 * h);
  doodleCtx.lineTo(seg.x1 * w, seg.y1 * h);
  doodleCtx.strokeStyle = seg.color || '#38bdf8';
  doodleCtx.lineWidth = seg.size || 4;
  doodleCtx.lineCap = 'round';
  doodleCtx.lineJoin = 'round';
  doodleCtx.stroke();
  doodleCtx.restore();
}

function redrawAllDoodleStrokes() {
  if (!doodleCtx || !doodleCanvas) return;
  doodleCtx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
  for (let i = 0; i < doodleStrokes.length; i++) {
    drawDoodleSegment(doodleStrokes[i]);
  }
}

function resizeDoodleCanvas() {
  if (!doodleCanvas) return;
  const rect = doodleCanvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  if (doodleCanvas.width !== Math.round(rect.width) || doodleCanvas.height !== Math.round(rect.height)) {
    doodleCanvas.width = Math.round(rect.width);
    doodleCanvas.height = Math.round(rect.height);
    redrawAllDoodleStrokes();
  }
}

function initDoodleCanvas() {
  if (!doodleCanvas) return;
  doodleCtx = doodleCanvas.getContext('2d');

  const getNormPoint = (e) => {
    const rect = doodleCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  };

  doodleCanvas.addEventListener('pointerdown', (e) => {
    if (!activeFriend || !socket) return;
    resizeDoodleCanvas();
    doodleCanvas.setPointerCapture(e.pointerId);
    isDoodling = true;
    lastDoodlePos = getNormPoint(e);
  });

  doodleCanvas.addEventListener('pointermove', (e) => {
    if (!isDoodling || !lastDoodlePos || !activeFriend || !socket) return;
    const nextPos = getNormPoint(e);
    const segment = {
      x0: lastDoodlePos.x,
      y0: lastDoodlePos.y,
      x1: nextPos.x,
      y1: nextPos.y,
      color: doodleColor,
      size: doodleSize
    };
    lastDoodlePos = nextPos;
    doodleStrokes.push(segment);
    if (doodleStrokes.length > 2500) doodleStrokes.splice(0, 500);
    drawDoodleSegment(segment);
    socket.emit('doodle-draw', { to: activeFriend, segment });
  });

  const endDraw = () => {
    isDoodling = false;
    lastDoodlePos = null;
  };
  doodleCanvas.addEventListener('pointerup', endDraw);
  doodleCanvas.addEventListener('pointercancel', endDraw);
  doodleCanvas.addEventListener('pointerleave', endDraw);
}

doodleColorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    doodleColorButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    doodleColor = btn.dataset.color || '#38bdf8';
  });
});

if (doodleSizeInput) {
  doodleSizeInput.addEventListener('input', () => {
    doodleSize = Number(doodleSizeInput.value) || 4;
  });
}

if (doodleClearBtn) {
  doodleClearBtn.addEventListener('click', () => {
    if (!activeFriend || !socket) return;
    socket.emit('doodle-clear', { to: activeFriend });
  });
}

// ================= INTERACTIVE PLAYING KITTENS =================

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

// ================= SHARED CANVAS PARTICLE ENGINE (BATTERY-FRIENDLY) =================

function mountParticleCanvas(canvasId, hueStart, hueRange, glowColor, isActiveCheck) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = canvas.clientWidth || window.innerWidth);
  let height = (canvas.height = canvas.clientHeight || window.innerHeight);

  const resizeCanvas = () => {
    if (!isActiveCheck()) return;
    width = canvas.width = canvas.clientWidth || window.innerWidth;
    height = canvas.height = canvas.clientHeight || window.innerHeight;
  };
  window.addEventListener('resize', resizeCanvas);

  const particles = [];
  const sparkles = [];
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const totalParticles = window.innerWidth < 768 ? 32 : 52;

  function createParticle(randomY = true) {
    const isHeart = Math.random() < 0.44;
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 25,
      size: isHeart ? 8 + Math.random() * 11 : 1.6 + Math.random() * 3,
      speedY: 0.25 + Math.random() * 0.55,
      swayAmp: 0.3 + Math.random() * 0.8,
      swaySpeed: 0.008 + Math.random() * 0.018,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.24 + Math.random() * 0.55,
      isHeart,
      hue: hueStart + Math.random() * hueRange
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

  const addSparkle = (x, y, burstCount = 1) => {
    if (!isActiveCheck()) return;
    const maxCap = isTouchDevice ? 55 : 36;
    for (let k = 0; k < burstCount; k++) {
      if (sparkles.length >= maxCap) break;
      const baseSize = isTouchDevice ? 11 + Math.random() * 9 : 6 + Math.random() * 6;
      sparkles.push({
        x: x + (Math.random() - 0.5) * (isTouchDevice ? 26 : 16),
        y: y + (Math.random() - 0.5) * (isTouchDevice ? 26 : 16),
        size: baseSize,
        alpha: 0.95,
        vy: -0.65 - Math.random() * 0.85,
        hue: hueStart + Math.random() * hueRange
      });
    }
  };

  let lastTouchSparkleAt = 0;
  window.addEventListener('mousemove', (e) => {
    if (Math.random() < 0.32) addSparkle(e.clientX, e.clientY, 1);
  });

  window.addEventListener('touchstart', (e) => {
    if (e.touches[0]) addSparkle(e.touches[0].clientX, e.touches[0].clientY, 3);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    const now = Date.now();
    if (e.touches[0] && now - lastTouchSparkleAt > 35) {
      lastTouchSparkleAt = now;
      addSparkle(e.touches[0].clientX, e.touches[0].clientY, 2);
    }
  }, { passive: true });

  function renderFrame() {
    requestAnimationFrame(renderFrame);
    if (document.hidden || !isActiveCheck()) return;

    if (canvas.clientWidth && canvas.clientHeight && (width !== canvas.clientWidth || height !== canvas.clientHeight)) {
      resizeCanvas();
    }
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
        ctx.fillStyle = `hsla(${hueStart + 10}, 100%, 88%, ${p.alpha * twinkle})`;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.y += s.vy;
      s.alpha -= 0.018;
      if (s.alpha <= 0) {
        sparkles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.fillStyle = `hsla(${s.hue}, 95%, 74%, ${s.alpha})`;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
      drawHeartPath(s.x, s.y, s.size);
      ctx.fill();
      ctx.restore();
    }
  }

  requestAnimationFrame(renderFrame);
}

function initRomanticBackgroundCanvas() {
  mountParticleCanvas('romantic-bg-canvas', 315, 45, 'rgba(244, 114, 182, 0.85)', () => !isGameModeOpen());
}

function initGameModeCanvas() {
  mountParticleCanvas('game-mode-canvas', 192, 26, 'rgba(56, 189, 248, 0.85)', () => isGameModeOpen());
}

// ================= FLOATING HEART SHOWER =================

function spawnHeartShower(count = 16) {
  if (!heartShowerStage) return;
  const emojis = ['💖', '💗', '❤️', '💕', '🐾', '✨'];
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
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': currentAuthToken || ''
      },
      body: JSON.stringify({ username: currentUser, token: currentAuthToken, subscription: sub })
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
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': currentAuthToken || ''
        },
        body: JSON.stringify({ username: currentUser, token: currentAuthToken })
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
  syncMobileViewportHeight();

  connectSocket();
  syncPushSubscription(false);
}

function forceLogoutToAuth(msg) {
  cleanupCallUI();
  stopGameSong();
  stopCatchBattleLoops();
  stopDuduAutoCycle();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  localStorage.removeItem('ps_username');
  localStorage.removeItem('ps_token');
  currentUser = null;
  currentAuthToken = null;
  activeFriend = null;
  clearReplyPreview();
  messagesList.innerHTML = '';
  if (ytIframe) {
    ytIframe.src = '';
    ytIframe.style.display = 'none';
  }
  if (ytEmptyMsg) ytEmptyMsg.style.display = 'block';
  ytVideoId = null;
  doodleStrokes = [];
  redrawAllDoodleStrokes();
  gameAudioMeta = { win: null, lose: null };
  renderGameAudioSettings();
  if (liveTypingPill) liveTypingPill.style.display = 'none';
  settingsModal.style.display = 'none';
  if (gameModeModal) gameModeModal.style.display = 'none';
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
  if (gameAudioFeedback) gameAudioFeedback.style.display = 'none';
  if (daFeedback) daFeedback.style.display = 'none';
  if (deleteAccountInlineForm) deleteAccountInlineForm.style.display = 'none';
  renderGameAudioSettings();
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  stopGameSong();
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
    if (currentAuthToken) localStorage.setItem('ps_token', currentAuthToken);
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
  if (confirmed && socket) {
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
if (emptyOpenMenuBtn) emptyOpenMenuBtn.addEventListener('click', openMobileSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

sideTabs.forEach(btn => {
  btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
});

// ================= TYPING STATUS HELPERS =================

function showRemoteTypingUI(fromUser) {
  headerSubtitle.textContent = 'typing...';
  headerSubtitle.classList.add('typing-glow');
  if (liveTypingPill && liveTypingText) {
    liveTypingText.textContent = `${fromUser} is typing...`;
    liveTypingPill.style.display = 'inline-flex';
  }
  clearTimeout(remoteTypingTimer);
  remoteTypingTimer = setTimeout(() => {
    hideRemoteTypingUI();
  }, 2500);
}

function hideRemoteTypingUI() {
  clearTimeout(remoteTypingTimer);
  headerSubtitle.classList.remove('typing-glow');
  if (liveTypingPill) liveTypingPill.style.display = 'none';
  updateActiveFriendHeader();
}

// ================= SOCKET.IO & REAL-TIME LISTENERS =================

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({
    query: { username: currentUser },
    auth: { token: currentAuthToken || '' }
  });

  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect' && currentUser) {
      showToast('Connection lost — reconnecting...', 'error');
    }
  });

  socket.on('reconnect', () => {
    if (currentUser) {
      showToast('Back online!', 'success');
      if (activeFriend) {
        socket.emit('load-private-chat', { friend: activeFriend });
      }
    }
  });

  socket.on('account-deleted', () => {
    forceLogoutToAuth('Session expired or account deleted. Please sign in.');
  });

  socket.on('game-toast', ({ message, type }) => {
    if (message) showToast(message, type || 'info');
  });

  // Sync Custom Game Songs across both players live
  socket.on('game-audio-sync', ({ audio, notifyText } = {}) => {
    if (audio) {
      gameAudioMeta = audio;
      renderGameAudioSettings();
    }
    if (notifyText) {
      showToast(notifyText, 'success');
    }
  });

  // Hydrate all 6 Game Mode modules + Custom Songs on initial connection
  socket.on('game-sync-state', (state) => {
    if (!state) return;
    if (state.gameAudio) {
      gameAudioMeta = state.gameAudio;
      renderGameAudioSettings();
    }
    if (state.ttt) {
      tttState = state.ttt;
      tttWinLine = getWinningLine(tttState.board || []).line || [];
      renderTicTacToe();
    }
    if (state.mind) {
      mindState = state.mind;
      renderMindSync();
    }
    if (state.rps) {
      rpsState = state.rps;
      lastAnnouncedRpsRound = rpsState.round || 1;
      renderRps();
    }
    if (state.catchGame) {
      catchState = state.catchGame;
      lastAnnouncedCatchEnd = catchState.endTime || 0;
      renderCatchGame();
    }
    if (state.ytVideoId) {
      applyYouTubeVideo(state.ytVideoId);
    }
    if (Array.isArray(state.doodleStrokes)) {
      doodleStrokes = state.doodleStrokes;
      redrawAllDoodleStrokes();
    }
  });

  // Live Game Listeners
  socket.on('ttt-state', (state) => {
    tttMovePending = false;
    if (!state) return;
    tttState = state;
    tttWinLine = getWinningLine(tttState.board || []).line || [];
    if (!tttState.winnerUser) lastAnnouncedTttWinKey = null;
    renderTicTacToe();
  });

  socket.on('mind-state', (state) => {
    if (!state) return;
    mindState = state;
    if (!mindState.revealed) lastAnnouncedMindKey = null;
    renderMindSync();
  });

  socket.on('rps-state', (state) => {
    if (!state) return;
    rpsState = state;
    renderRps();
  });

  socket.on('catch-state', (state) => {
    if (!state) return;
    catchState = state;
    renderCatchGame();
  });

  socket.on('yt-sync', ({ from, videoId }) => {
    if (videoId) {
      applyYouTubeVideo(videoId);
      if (from && from.toLowerCase() !== currentUser.toLowerCase()) {
        showToast(`${from} loaded a YouTube video`, 'info');
      }
    }
  });

  socket.on('watch-reaction', ({ emoji }) => {
    if (emoji) spawnWatchReaction(emoji);
  });

  socket.on('doodle-draw', (segment) => {
    if (!segment) return;
    doodleStrokes.push(segment);
    if (doodleStrokes.length > 2500) doodleStrokes.splice(0, 500);
    drawDoodleSegment(segment);
  });

  socket.on('doodle-clear', () => {
    doodleStrokes = [];
    redrawAllDoodleStrokes();
  });

  // Social & Chat Listeners
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
        clearReplyPreview();
        hideRemoteTypingUI();
        emptyChatState.style.display = 'block';
        headerCallActions.style.display = 'none';
        if (heartShowerBtn) heartShowerBtn.disabled = true;
        headerTitle.textContent = 'MINI-WORLD';
        headerSubtitle.textContent = 'Waiting for your partner...';
      } else {
        updateActiveFriendHeader();
        renderTicTacToe();
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
      hideRemoteTypingUI();
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
      showRemoteTypingUI(from);
    }
  });

  socket.on('stop-typing', ({ from }) => {
    if (activeFriend && from.toLowerCase() === activeFriend.toLowerCase()) {
      hideRemoteTypingUI();
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
    if (replyingToMessage && String(replyingToMessage.id) === String(id)) {
      clearReplyPreview();
    }
  });

  socket.on('chat-cleared', ({ friend }) => {
    if (activeFriend && friend.toLowerCase() === activeFriend.toLowerCase()) {
      messagesList.innerHTML = '';
      lastRenderedDateKey = null;
      clearReplyPreview();
    }
  });

  // WebRTC Call Listeners
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
          <div class="avatar-circle small">${escapeHTML(f.username.charAt(0).toUpperCase())}</div>
          <div>
            <div class="user-card-name">${escapeHTML(f.username)}</div>
            <div class="user-card-sub">
              <span class="${f.online ? 'dot-online' : 'dot-offline'}"></span>
              ${f.online ? 'online' : formatLastSeen(f.last_seen)}
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
  messageInput.placeholder = `Message`;

  clearReplyPreview();
  updateActiveFriendHeader();
  renderTicTacToe();
  renderMindSync();
  renderRps();
  renderCatchGame();
  renderSocialLists();
  if (socket) socket.emit('load-private-chat', { friend: friendName });
}

function updateActiveFriendHeader() {
  if (!activeFriend) return;
  const friendObj = socialState.friends.find(f => f.username.toLowerCase() === activeFriend.toLowerCase());
  const isOnline = friendObj ? friendObj.online : false;

  headerAvatar.textContent = activeFriend.charAt(0).toUpperCase();
  headerTitle.textContent = activeFriend;
  if (!headerSubtitle.classList.contains('typing-glow')) {
    headerSubtitle.textContent = isOnline
      ? 'online'
      : formatLastSeen(friendObj ? friendObj.last_seen : null);
  }
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
  setTimeout(scrollToBottom, 80);
}

function clearReplyPreview() {
  replyingToMessage = null;
  if (replyPreviewBar) replyPreviewBar.style.display = 'none';
}

if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', clearReplyPreview);

messageInput.addEventListener('focus', () => {
  syncMobileViewportHeight();
  setTimeout(scrollToBottom, 180);
});

messageInput.addEventListener('input', () => {
  if (!activeFriend || !socket) return;
  socket.emit('typing', { to: activeFriend });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (socket && activeFriend) socket.emit('stop-typing', { to: activeFriend });
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
  if (!activeFriend || !socket) return;
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
  messageInput.focus();
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
    if (!socket || !activeFriend) return;
    const burst = document.createElement('span');
    burst.className = 'double-tap-burst';
    burst.textContent = '❤️';
    bubbleEl.appendChild(burst);
    setTimeout(() => burst.remove(), 650);
    socket.emit('react-message', { id: msg.id, friend: activeFriend });
  };

  let lastTapAt = 0;
  bubbleEl.addEventListener('dblclick', triggerReaction);
  bubbleEl.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTapAt > 0 && now - lastTapAt < 300) {
      lastTapAt = 0;
      triggerReaction();
    } else {
      lastTapAt = now;
    }
  }, { passive: true });

  li.querySelector('.react-btn').addEventListener('click', triggerReaction);
  li.querySelector('.reply-btn').addEventListener('click', () => setReplyPreview(msg));

  if (isMine) {
    li.querySelector('.delete-msg-btn').addEventListener('click', () => {
      if (socket && activeFriend) {
        socket.emit('delete-message', { id: msg.id, friend: activeFriend });
      }
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
  if (peerConnection) return;
  stopGameSong();
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
        if (socket) {
          socket.emit('end-call', { to: targetUser });
          socket.emit('private-message', {
            to: targetUser,
            text: videoEnabled ? 'Missed video call' : 'Missed voice call'
          });
        }
        cleanupCallUI();
      }
    }, 30000);
  } catch (err) {
    cleanupCallUI();
    showToast('Microphone/camera permission is required for calling.', 'error');
  }
}

function handleIncomingCall({ from, offer, isVideo }) {
  if (peerConnection || !from || !offer) return;
  stopGameSong();
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
  if (!incomingOfferData || peerConnection) return;
  stopCallTone();
  incomingOverlay.style.display = 'none';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: isCurrentCallVideo ? { facingMode: currentFacingMode } : false
    });

    createPeerConnection(currentCallPartner);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOfferData));
    await flushIceQueue();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('make-answer', { to: currentCallPartner, answer });
    showActiveCallScreen();
  } catch (err) {
    showToast('Microphone/camera permission denied or call failed.', 'error');
    if (currentCallPartner && socket) socket.emit('reject-call', { to: currentCallPartner });
    cleanupCallUI();
  }
});

declineCallBtn.addEventListener('click', () => {
  stopCallTone();
  if (currentCallPartner && socket) socket.emit('reject-call', { to: currentCallPartner });
  cleanupCallUI();
});

cancelCallBtn.addEventListener('click', () => {
  stopCallTone();
  if (currentCallPartner && socket) {
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
  if (!peerConnection || !answer) return;
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await flushIceQueue();
    showActiveCallScreen();
  } catch (err) {
    cleanupCallUI();
    showToast('Call connection failed.', 'error');
  }
}

async function handleNewIceCandidate({ candidate }) {
  if (!candidate) return;
  if (peerConnection && peerConnection.remoteDescription) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {}
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
    if (e.candidate && socket) {
      socket.emit('ice-candidate', { to: partnerUsername, candidate: e.candidate });
    }
  };

  peerConnection.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
    } else if (e.track) {
      if (!remoteVideo.srcObject) remoteVideo.srcObject = new MediaStream();
      remoteVideo.srcObject.addTrack(e.track);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (!peerConnection) return;
    if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
      cleanupCallUI();
      showToast('Call disconnected.', 'info');
    }
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
    activeCallAvatar.textContent = (currentCallPartner || 'U').charAt(0).toUpperCase();
    activeCallUsername.textContent = currentCallPartner || 'Connected';
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
  const prevFacingMode = currentFacingMode;
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  const oldVideoTrack = localStream.getVideoTracks()[0];
  if (oldVideoTrack) {
    localStream.removeTrack(oldVideoTrack);
    oldVideoTrack.stop();
  }

  try {
    const newVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false
    });
    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    localStream.addTrack(newVideoTrack);
    localVideo.srcObject = localStream;
    localVideo.classList.toggle('back-cam', currentFacingMode === 'environment');

    if (peerConnection) {
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
    }
  } catch (err) {
    currentFacingMode = prevFacingMode;
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
  if (!currentCallPartner || !localStream || !socket) return;
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];
  socket.emit('call-media-state', {
    to: currentCallPartner,
    micEnabled: audioTrack ? audioTrack.enabled : true,
    camEnabled: videoTrack ? videoTrack.enabled : false
  });
}

endCallBtn.addEventListener('click', () => {
  if (currentCallPartner && socket) socket.emit('end-call', { to: currentCallPartner });
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
    peerConnection.onconnectionstatechange = null;
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