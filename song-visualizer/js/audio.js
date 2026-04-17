function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioData = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioCtx.destination);
    audioDestination = audioCtx.createMediaStreamDestination();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

let beatPhase = 0;
function simulateAudio() {
  beatPhase += 0.04;
  const kick = Math.max(0, Math.sin(beatPhase * Math.PI)) ** 4;
  const hihat = Math.random() * 0.3 * (Math.sin(beatPhase * 4) > 0.7 ? 1 : 0);
  for (let i = 0; i < 128; i++) {
    const bass = i < 8 ? kick * 220 : 0;
    const mid = (i > 20 && i < 60) ? Math.max(0, Math.sin(beatPhase * 2.1 + i * 0.2)) * 120 : 0;
    const hi = i > 80 ? hihat * 100 : 0;
    const noise = Math.random() * 10;
    audioData[i] = Math.min(255, bass + mid + hi + noise);
  }
}

function processAudio() {
  const sens = params.sensitivity / 60;
  const range = Math.max(1, freqHi - freqLo);
  for (let i = 0; i < 128; i++) {
    const srcBin = Math.round(freqLo + (i / 127) * range);
    const weight = 1 + Math.pow(i / 127, 0.5) * 1.8;
    freqSmooth[i] = lerp(freqSmooth[i], audioData[srcBin] * sens * weight, 0.3);
  }
}

function bands() {
  return {
    bass:  avg(freqSmooth, 0, 8)    / 255,
    low:   avg(freqSmooth, 8, 24)   / 255,
    mid:   avg(freqSmooth, 24, 64)  / 255,
    high:  avg(freqSmooth, 64, 128) / 255,
    total: avg(freqSmooth, 0, 128)  / 255,
  };
}
