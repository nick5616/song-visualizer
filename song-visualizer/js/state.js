const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");
const W = canvas.width,
    H = canvas.height;

let mode = "waveform";
let palette = "cyber";
let bg = "trail";
let params = {
    intensity: 50,
    density: 40,
    speed: 50,
    sensitivity: 60,
    glow: 60,
};
let audioData = new Uint8Array(128).fill(0);
let freqSmooth = new Float32Array(128).fill(0);
let freqLo = 0;
let freqHi = 127;

let analyser = null;
let audioCtx = null;
let micSource = null;
let micStream = null;
let micActive = false;

let fileAudioActive = false;
let audioBuffer = null;
let fileSource = null;
let fileOffset = 0;
let fileStartedAt = 0;
let filePlaying = false;

let audioDestination = null;
let audioSyncDelay = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

let t = 0;

let ghNotes = null;      // null = not yet analyzed, [] or [...] = analyzed
let ghLiveNotes = [];
let ghBandSmooth = new Float32Array(5).fill(0);
let ghLastLiveSpawn = new Float32Array(5).fill(-999);

let selectedModes = ['waveform'];
let multiSelect = false;
let cycleEnabled = false;
let cycleInterval = 8;
let beatSwitchEnabled = false;
let cycleFrameCount = 0;
let lastBassLevel = 0;
let beatCooldownFrames = 0;
