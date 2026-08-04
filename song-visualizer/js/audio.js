import { state } from "./state.js";
import { lerp, avg } from "./utils.js";

export function ensureAudioCtx() {
    if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 256;
        state.audioData = new Uint8Array(state.analyser.frequencyBinCount);
        state.analyser.connect(state.audioCtx.destination);
        state.audioDestination = state.audioCtx.createMediaStreamDestination();
        state.audioSyncDelay = state.audioCtx.createDelay(2.0);
        state.audioSyncDelay.delayTime.value = 0;
        state.audioSyncDelay.connect(state.audioDestination);
    }
    if (state.audioCtx.state === "suspended") state.audioCtx.resume();
}

let beatPhase = 0;
export function simulateAudio() {
    beatPhase += 0.04;
    const kick = Math.max(0, Math.sin(beatPhase * Math.PI)) ** 4;
    const hihat = Math.random() * 0.3 * (Math.sin(beatPhase * 4) > 0.7 ? 1 : 0);
    for (let i = 0; i < 128; i++) {
        const bass = i < 8 ? kick * 220 : 0;
        const mid = i > 20 && i < 60 ? Math.max(0, Math.sin(beatPhase * 2.1 + i * 0.2)) * 120 : 0;
        const hi = i > 80 ? hihat * 100 : 0;
        const noise = Math.random() * 10;
        state.audioData[i] = Math.min(255, bass + mid + hi + noise);
    }
}

export function processAudio() {
    const sens = state.params.sensitivity / 60;
    const range = Math.max(1, state.freqHi - state.freqLo);
    for (let i = 0; i < 128; i++) {
        const srcBin = Math.round(state.freqLo + (i / 127) * range);
        const weight = 1 + Math.pow(i / 127, 0.5) * 1.8;
        state.freqSmooth[i] = lerp(state.freqSmooth[i], state.audioData[srcBin] * sens * weight, 0.3);
    }
}

export function bands() {
    return {
        bass: avg(state.freqSmooth, 0, 8) / 255,
        low: avg(state.freqSmooth, 8, 24) / 255,
        mid: avg(state.freqSmooth, 24, 64) / 255,
        high: avg(state.freqSmooth, 64, 128) / 255,
        total: avg(state.freqSmooth, 0, 128) / 255,
    };
}

// ---- Offline track analysis ----
function fft(re, im, n) {
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            let tmp = re[i];
            re[i] = re[j];
            re[j] = tmp;
            tmp = im[i];
            im[i] = im[j];
            im[j] = tmp;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wc = Math.cos(ang),
            ws = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let rc = 1,
                rs = 0;
            for (let k = 0; k < len >> 1; k++) {
                const idx = i + k + (len >> 1);
                const ur = re[idx] * rc - im[idx] * rs;
                const ui = re[idx] * rs + im[idx] * rc;
                re[idx] = re[i + k] - ur;
                im[idx] = im[i + k] - ui;
                re[i + k] += ur;
                im[i + k] += ui;
                const nc = rc * wc - rs * ws;
                rs = rc * ws + rs * wc;
                rc = nc;
            }
        }
    }
}

export function analyzeTrack(audioBuffer) {
    const sr = audioBuffer.sampleRate;
    // Mix to mono
    const ch0 = audioBuffer.getChannelData(0);
    let pcm;
    if (audioBuffer.numberOfChannels > 1) {
        const ch1 = audioBuffer.getChannelData(1);
        pcm = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) pcm[i] = (ch0[i] + ch1[i]) * 0.5;
    } else {
        pcm = ch0;
    }

    const N = 1024;
    const hop = 512;
    const totalHops = Math.floor((pcm.length - N) / hop);

    // Pre-compute Hann window
    const hann = new Float32Array(N);
    for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

    // 5 bands: sub-bass, bass, low-mid, high-mid, treble
    // bin i → frequency i*sr/N
    const bands = [
        { lo: Math.round((20 * N) / sr), hi: Math.round((200 * N) / sr) },
        { lo: Math.round((200 * N) / sr), hi: Math.round((500 * N) / sr) },
        { lo: Math.round((500 * N) / sr), hi: Math.round((2000 * N) / sr) },
        { lo: Math.round((2000 * N) / sr), hi: Math.round((6000 * N) / sr) },
        { lo: Math.round((6000 * N) / sr), hi: Math.min(Math.round((20000 * N) / sr), N / 2 - 1) },
    ].map((b) => ({ lo: Math.max(1, b.lo), hi: Math.max(1, b.hi) }));

    const frameE = bands.map(() => new Float32Array(totalHops));
    const re = new Float32Array(N);
    const im = new Float32Array(N);

    for (let h = 0; h < totalHops; h++) {
        const off = h * hop;
        for (let i = 0; i < N; i++) re[i] = pcm[off + i] * hann[i];
        im.fill(0);
        fft(re, im, N);
        for (let bi = 0; bi < bands.length; bi++) {
            const { lo, hi } = bands[bi];
            let sum = 0;
            for (let k = lo; k <= hi; k++) sum += re[k] * re[k] + im[k] * im[k];
            frameE[bi][h] = Math.sqrt(sum / (hi - lo + 1));
        }
    }

    // Per-band percentiles
    const stats = bands.map((_, bi) => {
        const sorted = [...frameE[bi]].sort((a, b) => a - b);
        const p = (f) => sorted[Math.max(0, Math.floor(f * (sorted.length - 1)))];
        return { p50: p(0.5), p70: p(0.7), p85: p(0.85), p97: p(0.97) };
    });

    // Onset detection: rising edge above p70, min 110ms gap, label >p85 as "big"
    const notes = [];
    const minGap = Math.ceil(0.11 / (hop / sr));
    const lastOn = new Int32Array(bands.length).fill(-minGap);

    for (let h = 1; h < totalHops; h++) {
        for (let bi = 0; bi < bands.length; bi++) {
            const e = frameE[bi][h],
                ep = frameE[bi][h - 1];
            const st = stats[bi];
            if (e >= st.p70 && ep < st.p70 && h - lastOn[bi] >= minGap) {
                notes.push({
                    time: (h * hop) / sr,
                    lane: bi,
                    intensity: Math.min(1, (e - st.p70) / Math.max(1e-6, st.p97 - st.p70)),
                    big: e >= st.p85,
                });
                lastOn[bi] = h;
            }
        }
    }

    notes.sort((a, b) => a.time - b.time);
    return notes;
}
