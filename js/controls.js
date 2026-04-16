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

// ---- Recording ----
function getBestMimeType() {
  const types = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function getExtension(mimeType) {
  return mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
}

function startRecording() {
  if (isRecording || !audioDestination) return;
  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  recordedChunks = [];
  const mimeType = getBestMimeType();
  mediaRecorder = new MediaRecorder(combined, mimeType ? { mimeType } : {});
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(100);
  isRecording = true;
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    isRecording = false;
    return;
  }
  isRecording = false;
  mediaRecorder.onstop = () => updateFileUI();
  mediaRecorder.stop();
}

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
  stopRecording();
}

function updateFileUI() {
  const row = document.getElementById('playbackRow');
  const playBtn = document.getElementById('playPauseBtn');
  const dlBtn = document.getElementById('downloadBtn');
  if (!audioBuffer) { row.style.display = 'none'; return; }
  row.style.display = 'grid';
  playBtn.textContent = filePlaying ? '⏸ Pause' : '▶ Play';
  const showDownload = isRecording || recordedChunks.length > 0;
  dlBtn.style.display = showDownload ? 'block' : 'none';
}

function playFileAudio() {
  if (!audioBuffer) return;
  ensureAudioCtx();
  fileSource = audioCtx.createBufferSource();
  fileSource.buffer = audioBuffer;
  fileSource.connect(analyser);
  fileSource.connect(audioDestination);
  fileSource.start(0, fileOffset);
  fileStartedAt = audioCtx.currentTime - fileOffset;
  fileAudioActive = true;
  filePlaying = true;
  if (!isRecording) startRecording();
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
  recordedChunks = [];
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

document.getElementById('downloadBtn').addEventListener('click', () => {
  const name = document.getElementById('trackName').textContent || 'visualization';
  const mimeType = getBestMimeType() || 'video/webm';

  const save = () => {
    if (!recordedChunks.length) return;
    const blob = new Blob(recordedChunks, { type: mimeType.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + getExtension(mimeType);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    recordedChunks = [];
    // Restart recording if song is still playing
    if (filePlaying) startRecording();
    updateFileUI();
  };

  if (isRecording) {
    mediaRecorder.onstop = save;
    isRecording = false;
    mediaRecorder.stop();
  } else {
    save();
  }
});

// ---- Fullscreen ----
document.getElementById('fullscreenBtn').addEventListener('click', () => {
  const frame = document.querySelector('.phone-frame');
  if (frame.requestFullscreen) frame.requestFullscreen();
  else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
});
