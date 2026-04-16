// ---- Mode buttons ----
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    particles = [];
    tunnelRings = [];
    document.getElementById('modeLabel').textContent = btn.textContent.toUpperCase();
  });
});

// ---- Color swatches ----
document.querySelectorAll('.color-swatch').forEach(s => {
  s.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    palette = s.dataset.palette;
  });
});

// ---- Background buttons ----
document.querySelectorAll('.bg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bg = btn.dataset.bg;
  });
});

// ---- Parameter sliders ----
['intensity', 'density', 'speed', 'sensitivity', 'glow'].forEach(id => {
  const el = document.getElementById(id);
  const val = document.getElementById(id + 'Val');
  el.addEventListener('input', () => {
    params[id] = parseInt(el.value);
    val.textContent = el.value;
  });
});

// ---- Microphone ----
function disableMic() {
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micActive = false;
  document.getElementById('micBtn').classList.remove('active');
  document.getElementById('micBtn').textContent = '⬤ Enable Microphone';
  document.getElementById('micStatus').textContent = 'no audio — click to connect';
  document.getElementById('micStatus').className = 'mic-status';
  audioData.fill(0);
}

document.getElementById('micBtn').addEventListener('click', async () => {
  if (micActive) { disableMic(); return; }
  try {
    stopFileAudio();
    updateFileUI();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ensureAudioCtx();
    micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    micActive = true;
    document.getElementById('micBtn').classList.add('active');
    document.getElementById('micBtn').textContent = '■ Disable Microphone';
    document.getElementById('micStatus').textContent = '● live audio active';
    document.getElementById('micStatus').className = 'mic-status on';
  } catch (e) {
    document.getElementById('micStatus').textContent = 'mic access denied';
  }
});

// ---- MP3 file audio ----
function stopFileAudio() {
  if (fileSource) {
    fileSource.onended = null;
    try { fileSource.stop(); } catch (e) {}
    fileSource.disconnect();
    fileSource = null;
  }
  fileAudioActive = false;
  filePlaying = false;
  fileOffset = 0;
  fileStartedAt = 0;
}

function updateFileUI() {
  const row = document.getElementById('playbackRow');
  const btn = document.getElementById('playPauseBtn');
  if (!audioBuffer) { row.style.display = 'none'; return; }
  row.style.display = 'grid';
  btn.textContent = filePlaying ? '⏸ Pause' : '▶ Play';
}

function playFileAudio() {
  if (!audioBuffer) return;
  ensureAudioCtx();
  fileSource = audioCtx.createBufferSource();
  fileSource.buffer = audioBuffer;
  fileSource.connect(analyser);
  fileSource.start(0, fileOffset);
  fileStartedAt = audioCtx.currentTime - fileOffset;
  fileAudioActive = true;
  filePlaying = true;
  fileSource.onended = () => {
    if (filePlaying) { stopFileAudio(); updateFileUI(); }
  };
}

function pauseFileAudio() {
  if (!filePlaying || !fileSource) return;
  fileOffset = audioCtx.currentTime - fileStartedAt;
  fileSource.onended = null;
  try { fileSource.stop(); } catch (e) {}
  fileSource.disconnect();
  fileSource = null;
  filePlaying = false;
  fileAudioActive = false;
}

document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('mp3Input').click();
});

document.getElementById('mp3Input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  stopFileAudio();
  ensureAudioCtx();
  const nameEl = document.getElementById('trackName');
  nameEl.textContent = 'loading…';
  nameEl.className = 'track-name';
  const arrayBuffer = await file.arrayBuffer();
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    nameEl.textContent = file.name.replace(/\.[^.]+$/, '');
    nameEl.className = 'track-name loaded';
    fileOffset = 0;
    updateFileUI();
  } catch (err) {
    nameEl.textContent = 'error decoding file';
    audioBuffer = null;
    updateFileUI();
  }
  e.target.value = '';
});

document.getElementById('playPauseBtn').addEventListener('click', () => {
  if (!audioBuffer) return;
  if (micActive) disableMic();
  if (filePlaying) pauseFileAudio();
  else playFileAudio();
  updateFileUI();
});

document.getElementById('stopBtn').addEventListener('click', () => {
  stopFileAudio();
  updateFileUI();
});

// ---- Fullscreen ----
document.getElementById('fullscreenBtn').addEventListener('click', () => {
  const frame = document.querySelector('.phone-frame');
  if (frame.requestFullscreen) frame.requestFullscreen();
  else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
});
