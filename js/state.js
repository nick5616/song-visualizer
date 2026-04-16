const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let mode = 'particles';
let palette = 'cyber';
let bg = 'trail';
let params = { intensity: 50, density: 40, speed: 50, sensitivity: 60, glow: 60 };
let audioData = new Uint8Array(128).fill(0);
let freqSmooth = new Float32Array(128).fill(0);

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

let t = 0;
