import { state, canvas } from "./state.js";
import { ensureAudioCtx, analyzeTrack } from "./audio.js";
import { resetModeState } from "./visualizers.js";

// ---- Mode management ----
function updateModeBtnStyles() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const m = btn.dataset.mode;
        btn.classList.toggle('active', state.multiSelect ? state.selectedModes.includes(m) : m === state.mode);
    });
}

export function setMode(m) {
    state.mode = m;
    resetModeState();
    state.ghLiveNotes = [];
    state.ghBandSmooth.fill(0);
    state.ghLastLiveSpawn.fill(-999);
    document.getElementById('modeLabel').textContent = m.toUpperCase();
    updateModeBtnStyles();
}

export function advanceCycleMode() {
    if (state.selectedModes.length <= 1) return;
    const next = (state.selectedModes.indexOf(state.mode) + 1) % state.selectedModes.length;
    setMode(state.selectedModes[next]);
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        if (state.multiSelect) {
            const idx = state.selectedModes.indexOf(m);
            if (idx === -1) {
                state.selectedModes.push(m);
                setMode(m);
            } else if (state.selectedModes.length > 1) {
                state.selectedModes.splice(idx, 1);
                if (state.mode === m) setMode(state.selectedModes[0]);
                else updateModeBtnStyles();
            }
        } else {
            state.selectedModes = [m];
            setMode(m);
        }
    });
});

document.getElementById('multiSelectCheck').addEventListener('change', e => {
    state.multiSelect = e.target.checked;
    if (!state.multiSelect) state.selectedModes = [state.mode];
    updateModeBtnStyles();
});

document.getElementById('cycleCheck').addEventListener('change', e => {
    state.cycleEnabled = e.target.checked;
    state.cycleFrameCount = 0;
    document.getElementById('cycleRow').style.display = state.cycleEnabled ? 'flex' : 'none';
});

document.getElementById('beatSwitchCheck').addEventListener('change', e => {
    state.beatSwitchEnabled = e.target.checked;
    state.beatCooldownFrames = 0;
});

document.getElementById('cycleInterval').addEventListener('input', e => {
    state.cycleInterval = Math.max(1, parseInt(e.target.value) || 8);
    state.cycleFrameCount = 0;
});

// ---- Color swatches ----
document.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        state.palette = s.dataset.palette;
    });
});

// ---- Background buttons ----
document.querySelectorAll('.bg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.bg = btn.dataset.bg;
    });
});

// ---- Parameter sliders ----
['intensity', 'density', 'speed', 'sensitivity', 'glow'].forEach(id => {
    const el = document.getElementById(id);
    const val = document.getElementById(id + 'Val');
    el.addEventListener('input', () => {
        state.params[id] = parseInt(el.value);
        val.textContent = el.value;
    });
});

// ---- Frequency range dual slider ----
function binToHz(bin) {
    const hz = Math.round(bin * 44100 / 256);
    return hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : hz + ' Hz';
}

function updateFreqRange() {
    const lo = parseInt(document.getElementById('freqLoSlider').value);
    const hi = parseInt(document.getElementById('freqHiSlider').value);
    state.freqLo = Math.min(lo, hi - 1);
    state.freqHi = Math.max(hi, lo + 1);
    document.getElementById('freqLoLabel').textContent = binToHz(state.freqLo);
    document.getElementById('freqHiLabel').textContent = binToHz(state.freqHi);
    const fill = document.getElementById('freqRangeFill');
    fill.style.left  = (state.freqLo / 127 * 100) + '%';
    fill.style.width = ((state.freqHi - state.freqLo) / 127 * 100) + '%';
}

document.getElementById('freqLoSlider').addEventListener('input', () => {
    const lo = parseInt(document.getElementById('freqLoSlider').value);
    const hi = parseInt(document.getElementById('freqHiSlider').value);
    if (lo >= hi) document.getElementById('freqLoSlider').value = hi - 1;
    updateFreqRange();
});

document.getElementById('freqHiSlider').addEventListener('input', () => {
    const lo = parseInt(document.getElementById('freqLoSlider').value);
    const hi = parseInt(document.getElementById('freqHiSlider').value);
    if (hi <= lo) document.getElementById('freqHiSlider').value = lo + 1;
    updateFreqRange();
});

updateFreqRange();

// ---- Microphone ----
function disableMic() {
    if (state.micSource) { state.micSource.disconnect(); state.micSource = null; }
    if (state.micStream) { state.micStream.getTracks().forEach(t => t.stop()); state.micStream = null; }
    state.micActive = false;
    document.getElementById('micBtn').classList.remove('active');
    document.getElementById('micBtn').textContent = '⬤ Enable Microphone';
    document.getElementById('micStatus').textContent = 'no audio — click to connect';
    document.getElementById('micStatus').className = 'mic-status';
    state.audioData.fill(0);
}

document.getElementById('micBtn').addEventListener('click', async () => {
    if (state.micActive) { disableMic(); return; }
    try {
        stopFileAudio();
        updateFileUI();
        state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ensureAudioCtx();
        state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);
        state.micSource.connect(state.analyser);
        state.micActive = true;
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
    if (state.isRecording || !state.audioDestination) return;
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...state.audioDestination.stream.getAudioTracks(),
    ]);
    state.recordedChunks = [];
    const avDelay = (state.audioCtx.outputLatency || 0) + (state.audioCtx.baseLatency || 0);
    state.audioSyncDelay.delayTime.value = avDelay;
    const mimeType = getBestMimeType();
    const recorderOptions = {
        videoBitsPerSecond: 16_000_000,
        audioBitsPerSecond: 192_000,
        ...(mimeType ? { mimeType } : {}),
    };
    state.mediaRecorder = new MediaRecorder(combined, recorderOptions);
    state.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) state.recordedChunks.push(e.data);
    };
    state.mediaRecorder.start(100);
    state.isRecording = true;
}

function stopRecording() {
    if (state.audioSyncDelay) state.audioSyncDelay.delayTime.value = 0;
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') {
        state.isRecording = false;
        return;
    }
    state.isRecording = false;
    state.mediaRecorder.onstop = () => updateFileUI();
    state.mediaRecorder.stop();
}

// ---- MP3 file audio ----
function stopFileAudio() {
    if (state.fileSource) {
        state.fileSource.onended = null;
        try { state.fileSource.stop(); } catch (e) {}
        state.fileSource.disconnect();
        state.fileSource = null;
    }
    state.fileAudioActive = false;
    state.filePlaying = false;
    state.fileOffset = 0;
    state.fileStartedAt = 0;
    stopRecording();
}

function updateFileUI() {
    const row = document.getElementById('playbackRow');
    const playBtn = document.getElementById('playPauseBtn');
    const dlBtn = document.getElementById('downloadBtn');
    if (!state.audioBuffer) { row.style.display = 'none'; return; }
    row.style.display = 'grid';
    playBtn.textContent = state.filePlaying ? '⏸ Pause' : state.fileOffset > 0 ? '▶ Resume' : '▶ Play';
    const showDownload = state.isRecording || state.recordedChunks.length > 0;
    dlBtn.style.display = showDownload ? 'block' : 'none';
}

function playFileAudio() {
    if (!state.audioBuffer) return;
    ensureAudioCtx();
    state.fileSource = state.audioCtx.createBufferSource();
    state.fileSource.buffer = state.audioBuffer;
    state.fileSource.connect(state.analyser);
    state.fileSource.connect(state.audioSyncDelay);
    state.fileSource.start(0, state.fileOffset);
    state.fileStartedAt = state.audioCtx.currentTime - state.fileOffset;
    state.fileAudioActive = true;
    state.filePlaying = true;
    if (!state.isRecording) startRecording();
    state.fileSource.onended = () => {
        if (state.filePlaying) { stopFileAudio(); updateFileUI(); }
    };
}

function pauseFileAudio() {
    if (!state.filePlaying || !state.fileSource) return;
    state.fileOffset = state.audioCtx.currentTime - state.fileStartedAt;
    state.fileSource.onended = null;
    try { state.fileSource.stop(); } catch (e) {}
    state.fileSource.disconnect();
    state.fileSource = null;
    state.filePlaying = false;
    state.fileAudioActive = false;
}

document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('mp3Input').click();
});

document.getElementById('mp3Input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    stopFileAudio();
    state.recordedChunks = [];
    ensureAudioCtx();
    const nameEl = document.getElementById('trackName');
    nameEl.textContent = 'loading…';
    nameEl.className = 'track-name';
    const arrayBuffer = await file.arrayBuffer();
    try {
        state.audioBuffer = await state.audioCtx.decodeAudioData(arrayBuffer);
        nameEl.textContent = file.name.replace(/\.[^.]+$/, '');
        nameEl.className = 'track-name loaded';
        state.fileOffset = 0;
        state.ghNotes = null;
        state.ghLiveNotes = [];
        updateFileUI();
        setTimeout(() => { state.ghNotes = analyzeTrack(state.audioBuffer); }, 50);
    } catch (err) {
        nameEl.textContent = 'error decoding file';
        state.audioBuffer = null;
        updateFileUI();
    }
    e.target.value = '';
});

document.getElementById('playPauseBtn').addEventListener('click', () => {
    if (!state.audioBuffer) return;
    if (state.micActive) disableMic();
    if (state.filePlaying) pauseFileAudio();
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
        if (!state.recordedChunks.length) return;
        const blob = new Blob(state.recordedChunks, { type: mimeType.split(';')[0] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name + getExtension(mimeType);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        state.recordedChunks = [];
        // Restart recording if song is still playing
        if (state.filePlaying) startRecording();
        updateFileUI();
    };

    if (state.isRecording) {
        state.mediaRecorder.onstop = save;
        state.isRecording = false;
        state.mediaRecorder.stop();
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
