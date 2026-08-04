export const canvas = document.getElementById("viz");
export const ctx = canvas.getContext("2d");
export const W = canvas.width;
export const H = canvas.height;

export const state = {
    mode: "waveform",
    palette: "cyber",
    bg: "trail",
    params: {
        intensity: 50,
        density: 40,
        speed: 50,
        sensitivity: 60,
        glow: 60,
    },
    audioData: new Uint8Array(128).fill(0),
    freqSmooth: new Float32Array(128).fill(0),
    freqLo: 0,
    freqHi: 127,

    analyser: null,
    audioCtx: null,
    micSource: null,
    micStream: null,
    micActive: false,

    fileAudioActive: false,
    audioBuffer: null,
    fileSource: null,
    fileOffset: 0,
    fileStartedAt: 0,
    filePlaying: false,

    audioDestination: null,
    audioSyncDelay: null,
    mediaRecorder: null,
    recordedChunks: [],
    isRecording: false,

    t: 0,

    ghNotes: null, // null = not yet analyzed, [] or [...] = analyzed
    ghLiveNotes: [],
    ghBandSmooth: new Float32Array(5).fill(0),
    ghLastLiveSpawn: new Float32Array(5).fill(-999),

    selectedModes: ["waveform"],
    multiSelect: false,
    cycleEnabled: false,
    cycleInterval: 8,
    beatSwitchEnabled: false,
    cycleFrameCount: 0,
    lastBassLevel: 0,
    beatCooldownFrames: 0,
};
