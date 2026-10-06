import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom/client";

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pitchClass = (midi) => midi % 12;

const MODES = {
  Ionian:       [0, 2, 4, 5, 7, 9, 11],
  Dorian:       [0, 2, 3, 5, 7, 9, 10],
  Phrygian:     [0, 1, 3, 5, 7, 8, 10],
  Lydian:       [0, 2, 4, 6, 7, 9, 11],
  Mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  Aeolian:      [0, 2, 3, 5, 7, 8, 10],
  Locrian:      [0, 1, 3, 5, 6, 8, 10],
  HarmonicMinor:[0, 2, 3, 5, 7, 8, 11],
  MelodicMinor: [0, 2, 3, 5, 7, 9, 11],
};

// Which parent major-scale root (in semitones above the mode's own tonic) each mode borrows its
// key signature from — e.g. G Aeolian borrows Bb major's signature, so it reads with flats.
const MODE_PARENT_MAJOR_OFFSET = {
  Ionian: 0, Dorian: 10, Phrygian: 8, Lydian: 7, Mixolydian: 5,
  Aeolian: 3, Locrian: 1, HarmonicMinor: 3, MelodicMinor: 3,
};
const FLAT_MAJOR_ROOTS = new Set([1, 3, 5, 8, 10]); // Db, Eb, F, Ab, Bb major
const getNoteNames = (keyRoot, mode) => {
  const parentRoot = (keyRoot + (MODE_PARENT_MAJOR_OFFSET[mode] ?? 0)) % 12;
  return FLAT_MAJOR_ROOTS.has(parentRoot) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
};

const scalePitchClasses = (rootPc, mode) =>
  MODES[mode].map((iv) => (rootPc + iv) % 12);

const QUALITY_NAMES = { maj: "", min: "m", dim: "°", aug: "+" };
const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii"];

const diatonicTriads = (rootPc, mode) => {
  const scale = scalePitchClasses(rootPc, mode);
  return scale.map((_, i) => {
    const r = scale[i];
    const t = scale[(i + 2) % 7];
    const f = scale[(i + 4) % 7];
    const third = (t - r + 12) % 12;
    const fifth = (f - r + 12) % 12;
    let quality;
    if (third === 4 && fifth === 7) quality = "maj";
    else if (third === 3 && fifth === 7) quality = "min";
    else if (third === 3 && fifth === 6) quality = "dim";
    else if (third === 4 && fifth === 8) quality = "aug";
    else quality = "other";
    let roman = ROMAN[i];
    if (quality === "min" || quality === "dim") roman = roman.toLowerCase();
    if (quality === "dim") roman += "°";
    if (quality === "aug") roman += "+";
    return { degree: i + 1, roman, rootPc: r, quality, pcs: [r, t, f] };
  });
};

const CHORD_TEMPLATES = [
  { name: "maj",   intervals: [0, 4, 7],     weight: 1.0 },
  { name: "min",   intervals: [0, 3, 7],     weight: 1.0 },
  { name: "7",     intervals: [0, 4, 7, 10], weight: 0.95 },
  { name: "maj7",  intervals: [0, 4, 7, 11], weight: 0.9 },
  { name: "min7",  intervals: [0, 3, 7, 10], weight: 0.9 },
  { name: "dim",   intervals: [0, 3, 6],     weight: 0.7 },
  { name: "dim7",  intervals: [0, 3, 6, 9],  weight: 0.7 },
  { name: "m7b5",  intervals: [0, 3, 6, 10], weight: 0.75 },
  { name: "sus4",  intervals: [0, 5, 7],     weight: 0.6 },
  { name: "sus2",  intervals: [0, 2, 7],     weight: 0.6 },
  { name: "aug",   intervals: [0, 4, 8],     weight: 0.5 },
];

const inferChord = (pcWeights, keyRoot, mode) => {
  if (pcWeights.size === 0) return null;
  const noteNames = getNoteNames(keyRoot, mode);
  const scale = new Set(scalePitchClasses(keyRoot, mode));
  let best = null;
  for (let root = 0; root < 12; root++) {
    for (const tpl of CHORD_TEMPLATES) {
      const chordPcs = tpl.intervals.map((iv) => (root + iv) % 12);
      let matched = 0, totalPresent = 0;
      for (const pc of chordPcs) {
        if (pcWeights.has(pc)) { matched += pcWeights.get(pc); totalPresent++; }
      }
      if (totalPresent < 2) continue;
      let missingPenalty = 0;
      if (!pcWeights.has(chordPcs[0])) missingPenalty += 0.4;
      if (!pcWeights.has(chordPcs[1])) missingPenalty += 0.3;
      if (chordPcs[2] !== undefined && !pcWeights.has(chordPcs[2])) missingPenalty += 0.1;
      let extraPenalty = 0;
      for (const [pc, w] of pcWeights) {
        if (!chordPcs.includes(pc)) {
          const iv = (pc - root + 12) % 12;
          extraPenalty += w * ([2, 5, 9, 11].includes(iv) ? 0.15 : 0.35);
        }
      }
      const keyBonus = scale.has(root) ? 0.15 : 0;
      const allDiatonic = chordPcs.every((pc) => scale.has(pc)) ? 0.2 : 0;
      const score = matched * tpl.weight - missingPenalty - extraPenalty + keyBonus + allDiatonic;
      if (!best || score > best.score) {
        best = { root, quality: tpl.name, pcs: chordPcs, score,
          symbol: `${noteNames[root]}${QUALITY_NAMES[tpl.name] ?? tpl.name}` };
      }
    }
  }
  if (best) {
    const triads = diatonicTriads(keyRoot, mode);
    const match = triads.find((t) => t.rootPc === best.root);
    if (match && (best.quality === match.quality || best.quality.startsWith(match.quality))) {
      best.roman = match.roman; best.functional = true;
    } else { best.roman = null; best.functional = false; }
  }
  return best;
};

const PROGRESSION_WEIGHTS = {
  I:   { IV: 0.9, V: 0.95, vi: 0.75, ii: 0.8, iii: 0.5, "vii°": 0.4 },
  ii:  { V: 0.95, "V7": 0.95, vii: 0.5, IV: 0.4 },
  iii: { vi: 0.8, IV: 0.6, ii: 0.5 },
  IV:  { V: 0.9, I: 0.7, ii: 0.6, vi: 0.5, "V7": 0.85 },
  V:   { I: 0.95, vi: 0.6, IV: 0.3 },
  vi:  { ii: 0.8, IV: 0.7, V: 0.6, iii: 0.5 },
  "vii°": { I: 0.9, iii: 0.4 },
  i:    { iv: 0.85, V: 0.9, v: 0.7, VI: 0.75, "ii°": 0.5, III: 0.6, VII: 0.7 },
  "ii°":{ V: 0.9, i: 0.4 },
  III:  { VI: 0.75, iv: 0.6 },
  iv:   { V: 0.9, i: 0.7, VII: 0.6 },
  v:    { i: 0.7, VI: 0.5 },
  VI:   { "ii°": 0.6, iv: 0.65, III: 0.5, V: 0.7 },
  VII:  { III: 0.7, i: 0.6 },
};

const predictNextChords = (currentRoman, keyRoot, mode, limit = 3) => {
  if (!currentRoman) return [];
  const weights = PROGRESSION_WEIGHTS[currentRoman] || {};
  const triads = diatonicTriads(keyRoot, mode);
  const byChord = new Map();
  for (const [nextRoman, w] of Object.entries(weights)) {
    const base = nextRoman.replace("7", "");
    const match = triads.find((t) => t.roman === base);
    if (!match) continue;
    const key = `${match.rootPc}-${match.quality}`;
    const existing = byChord.get(key);
    if (!existing || w > existing.probability) byChord.set(key, { ...match, probability: w });
  }
  const results = [...byChord.values()];
  results.sort((a, b) => b.probability - a.probability);
  return results.slice(0, limit);
};

const buildChordSymbol = (rootPc, quality, noteNames = NOTE_NAMES_SHARP) =>
  `${noteNames[rootPc]}${QUALITY_NAMES[quality] ?? quality}`;

const CONTEXT_NOTE_COUNT = 10;
const selectContextNotes = (notes) => {
  if (notes.length === 0) return [];
  return [...notes].sort((a, b) => a.startTime - b.startTime).slice(-CONTEXT_NOTE_COUNT);
};
const computePcWeightsFlat = (contextNotes) => {
  const weights = new Map();
  const n = contextNotes.length;
  contextNotes.forEach((note, idx) => {
    const recencyBias = 0.5 + 0.5 * (idx / Math.max(1, n - 1));
    const pc = pitchClass(note.pitch);
    const w = (note.velocity / 127) * recencyBias;
    weights.set(pc, (weights.get(pc) || 0) + w);
  });
  return weights;
};

const suggestNotes = (currentChord, nextChords, keyRoot, mode) => {
  const scale = new Set(scalePitchClasses(keyRoot, mode));
  const result = new Map();
  if (currentChord) {
    for (const pc of currentChord.pcs) result.set(pc, { role: "chord", weight: 0.85 });
    result.set(currentChord.pcs[0], { role: "tonic", weight: 1.0 });
  }
  if (nextChords.length > 0) {
    const top = nextChords[0];
    for (const pc of top.pcs) {
      if (!result.has(pc)) result.set(pc, { role: "leading", weight: 0.6 * top.probability });
    }
  }
  for (const pc of scale) {
    if (!result.has(pc)) {
      if (currentChord) {
        const iv = (pc - currentChord.pcs[0] + 12) % 12;
        if ([2, 5, 9, 11].includes(iv)) { result.set(pc, { role: "tension", weight: 0.35 }); continue; }
      }
      result.set(pc, { role: "scale", weight: 0.25 });
    }
  }
  if (currentChord && currentChord.quality === "maj") {
    const four = (currentChord.pcs[0] + 5) % 12;
    if (scale.has(four) && result.get(four)?.role !== "tonic")
      result.set(four, { role: "avoid", weight: 0.15 });
  }
  return result;
};

function yinDetect(buf, sampleRate) {
  const half = Math.floor(buf.length / 2);
  const threshold = 0.12;
  const diff = new Float32Array(half);
  for (let tau = 1; tau < half; tau++) {
    for (let i = 0; i < half; i++) { const d = buf[i] - buf[i + tau]; diff[tau] += d * d; }
  }
  const cmnd = new Float32Array(half);
  cmnd[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < half; tau++) { runSum += diff[tau]; cmnd[tau] = runSum === 0 ? 0 : diff[tau] * tau / runSum; }
  let tau = 2;
  while (tau < half) { if (cmnd[tau] < threshold) { while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) tau++; break; } tau++; }
  if (tau === half) return 0;
  const x0 = tau > 1 ? tau - 1 : tau, x2 = tau + 1 < half ? tau + 1 : tau;
  let best;
  if (x0 === tau) { best = cmnd[tau] <= cmnd[x2] ? tau : x2; }
  else if (x2 === tau) { best = cmnd[tau] <= cmnd[x0] ? tau : x0; }
  else { const s0 = cmnd[x0], s1 = cmnd[tau], s2 = cmnd[x2]; best = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0)); }
  return sampleRate / best;
}
function freqToMidi(freq) {
  if (freq <= 0) return null;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return (midi >= 36 && midi <= 96) ? midi : null;
}

const ROLE_COLORS = {
  tonic:   { light: "#d4b5ff", glow: "#c896ff" },
  chord:   { light: "#8ce4ff", glow: "#5ccfff" },
  leading: { light: "#a0f5c4", glow: "#6de59e" },
  tension: { light: "#ffd98a", glow: "#ffbc52" },
  scale:   { light: "#e8e8e8", glow: "#c0c0c0" },
  avoid:   { light: "#5a3030", glow: "#aa4040" },
};

const KEY_NAMES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
const ALL_MODES = Object.keys(MODES);
const BLACK_KEYS = [1, 3, 6, 8, 10];
const isBlackKey = (midi) => BLACK_KEYS.includes(midi % 12);
const KEYBOARD_START = 36, KEYBOARD_END = 96, PITCH_RANGE = 60;
const ROLL_ROW_HEIGHT_SCALE = 1.1; // piano-roll key height, ~10% taller than an even fit
const QWERTY_MAP = { a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,";":16,"'":17 };
const PRODUCER_KEYBOARD_WIDTH = 72, ROLL_PX_PER_SEC = 120;
const PRODUCER_FONT = '"JetBrains Mono", "SF Mono", Menlo, monospace';
const IMPROV_FONT = '"Bitcount Grid Double", "JetBrains Mono", monospace';
const UI_FONT = '"JetBrains Mono", monospace';

const COMPOSER_PX_PER_BEAT = 100;
const COMPOSER_BRACKET_H = 22;
const COMPOSER_DURATIONS = [
  { beats: 4, label: "whole" },
  { beats: 2, label: "half" },
  { beats: 1, label: "quarter" },
  { beats: 0.5, label: "8th" },
  { beats: 0.25, label: "16th" },
];
const voiceChordNear = (pcs, centerPitch) =>
  pcs.map(pc => {
    let best = null, bestDist = Infinity;
    for (let oct = 2; oct <= 7; oct++) {
      const midi = oct * 12 + pc;
      if (midi < 36 || midi > 96) continue;
      const d = Math.abs(midi - centerPitch);
      if (d < bestDist) { bestDist = d; best = midi; }
    }
    return best;
  }).filter(n => n !== null);

const ctrlStyle = {
  padding: "4px 8px", background: "#15151a", color: "#d0d0d8",
  border: "1px solid #2a2a35", borderRadius: 3, fontSize: 11,
  fontFamily: UI_FONT, letterSpacing: "0.05em",
};
const miniBtn = {
  padding: "2px 6px", background: "#15151a", color: "#888",
  border: "1px solid #2a2a35", borderRadius: 3, fontSize: 11,
  cursor: "pointer", fontFamily: UI_FONT, margin: "0 2px",
};

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
      <span>{label}</span>
    </div>
  );
}

function PillDropdown({ value, options, onChange, swatchColor, width = 84 }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={rootRef} style={{ position: "relative", fontFamily: UI_FONT }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 9px", background: "#15151a",
        color: "#d0d0d8", border: "1px solid #2a2a35", borderRadius: 3, fontSize: 11,
        letterSpacing: "0.05em", cursor: "pointer", minWidth: width, justifyContent: "space-between",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {swatchColor && <span style={{ width: 8, height: 8, borderRadius: 2, background: swatchColor, flexShrink: 0 }} />}
          {current?.label ?? value}
        </span>
        <span style={{ color: "#666", fontSize: 8 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "#15151a", border: "1px solid #2a2a35", borderRadius: 4,
          maxHeight: 320, overflowY: "auto", minWidth: width, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {options.map((o) => (
            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                padding: "5px 10px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                background: o.value === value ? "#1a3a3a" : "transparent",
                color: o.value === value ? "#8ce4ff" : "#c8c8d0",
              }}
              onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = "#1e1e26"; }}
              onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChordOptionCard({ nc, avgPitch, noteNames = NOTE_NAMES_SHARP, isHovered, onHoverStart, onHoverEnd, onClick }) {
  const symbol = `${noteNames[nc.rootPc]}${QUALITY_NAMES[nc.quality] ?? nc.quality}`;
  const voiced = voiceChordNear(nc.pcs, avgPitch ?? 60);
  const minP = Math.min(...voiced) - 2, maxP = Math.max(...voiced) + 2, span = Math.max(1, maxP - minP);
  return (
    <div
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onClick}
      style={{
        width: 92, minWidth: 92, height: 86, background: isHovered ? "#1a2432" : "#12121a",
        border: `1px solid ${isHovered ? "#5ccfff" : "#2a2a35"}`, borderRadius: 5, padding: 6,
        cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, fontFamily: UI_FONT,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div style={{ position: "relative", flex: 1, background: "#0a0a0e", borderRadius: 3, overflow: "hidden" }}>
        {voiced.map((p, i) => {
          const topPct = ((maxP - p) / span) * 100;
          return (
            <div key={i} style={{
              position: "absolute", left: 3, right: 3, top: `${Math.max(0, Math.min(88, topPct))}%`,
              height: 5, borderRadius: 1,
              background: isBlackKey(p) ? "#5ccfff" : "#c8f0ff",
              boxShadow: isHovered ? "0 0 4px rgba(140,228,255,0.7)" : "none",
            }} />
          );
        })}
      </div>
      <div style={{ fontSize: 11, textAlign: "center", color: "#ddd", fontWeight: 600 }}>{symbol}</div>
      <div style={{ fontSize: 9, textAlign: "center", color: "#666" }}>{nc.roman} · {Math.round(nc.probability * 100)}%</div>
    </div>
  );
}

function MidiMuse() {
  const [view, setView] = useState("composer");
  const [keyRoot, setKeyRoot] = useState(0);
  const [mode, setMode] = useState("Ionian");
  const [bpm, setBpm] = useState(100);
  const [isRecording, setIsRecording] = useState(false);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [notes, setNotes] = useState([]);
  const [activeNotes, setActiveNotes] = useState(new Map());
  const [midiInputs, setMidiInputs] = useState([]);
  const [selectedInputId, setSelectedInputId] = useState(null);
  const [midiStatus, setMidiStatus] = useState("idle");
  const [toneReady, setToneReady] = useState(false);
  const [octaveShift, setOctaveShift] = useState(0);
  const [now, setNow] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [scrollX, setScrollX] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const [drag, setDrag] = useState(null);
  const [inputMode, setInputMode] = useState("midi");
  const [voicePitch, setVoicePitch] = useState(null);
  const [composerNotes, setComposerNotes] = useState([]);
  const [composerCursor, setComposerCursor] = useState(0);
  const [composerDuration, setComposerDuration] = useState(1);
  const [composerBracket, setComposerBracket] = useState({ startBeat: 0, endBeat: 4 });
  const [composerScrollX, setComposerScrollX] = useState(0);
  const [bracketDragState, setBracketDragState] = useState(null);
  const [isComposerPlaying, setIsComposerPlaying] = useState(false);
  const [isProducerPlaying, setIsProducerPlaying] = useState(false);
  const [hoveredSuggestion, setHoveredSuggestion] = useState(null);
  const [playWholeContext, setPlayWholeContext] = useState(false);
  const [quantizeLive, setQuantizeLive] = useState(false);
  const [suggestionOctave, setSuggestionOctave] = useState(0);

  const recordStartRef = useRef(null);
  const activeNotesRef = useRef(new Map());
  const synthRef = useRef(null);
  const metronomeRef = useRef(null);
  const rafRef = useRef(null);
  const visualEventsRef = useRef([]);
  const canvasRef = useRef(null);
  const improvCanvasRef = useRef(null);
  const isRecordingRef = useRef(isRecording);
  const micStreamRef = useRef(null);
  const voiceAudioCtxRef = useRef(null);
  const voiceProcessorRef = useRef(null);
  const voiceActivePitchRef = useRef(null);
  const voiceStableRef = useRef({ pitch: null, count: 0 });
  const composerCanvasRef = useRef(null);
  const viewRef = useRef("composer");
  const composerCursorRef = useRef(0);
  const composerDurationRef = useRef(1);
  const composerPlayTimeoutsRef = useRef([]);
  const composerPlayStartRef = useRef(null);
  const producerPlayTimeoutsRef = useRef([]);
  const producerPlayStartRef = useRef(null);
  const bpmRef = useRef(bpm);
  const composerActiveRef = useRef(new Map());
  const composerGroupStartBeatRef = useRef(null);
  const composerGroupEndBeatRef = useRef(0);
  const hoverTimeoutsRef = useRef([]);
  const hoverNotesRef = useRef([]);
  const quantizeLiveRef = useRef(false);
  const isComposerPlayingRef = useRef(false);
  const isProducerPlayingRef = useRef(false);
  const playComposerFromCursorRef = useRef(() => {});
  const stopComposerPlaybackRef = useRef(() => {});
  const playProducerNotesRef = useRef(() => {});
  const stopProducerPlaybackRef = useRef(() => {});

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { composerCursorRef.current = composerCursor; }, [composerCursor]);
  useEffect(() => { composerDurationRef.current = composerDuration; }, [composerDuration]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { quantizeLiveRef.current = quantizeLive; }, [quantizeLive]);
  useEffect(() => { isComposerPlayingRef.current = isComposerPlaying; }, [isComposerPlaying]);
  useEffect(() => { isProducerPlayingRef.current = isProducerPlaying; }, [isProducerPlaying]);

  useEffect(() => {
    if (document.querySelector('link[data-midimuse-fonts]')) return;
    const pre1 = document.createElement("link"); pre1.rel = "preconnect"; pre1.href = "https://fonts.googleapis.com"; pre1.setAttribute("data-midimuse-fonts","1"); document.head.appendChild(pre1);
    const pre2 = document.createElement("link"); pre2.rel = "preconnect"; pre2.href = "https://fonts.gstatic.com"; pre2.crossOrigin = "anonymous"; pre2.setAttribute("data-midimuse-fonts","1"); document.head.appendChild(pre2);
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "https://fonts.googleapis.com/css2?family=Astloch:wght@400;700&family=Bitcount+Grid+Double:wght@100..900&display=swap"; link.setAttribute("data-midimuse-fonts","1"); document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js";
    script.onload = () => setToneReady(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch(e) {} };
  }, []);

  useEffect(() => {
    if (!toneReady || !window.Tone) return;
    const reverb = new window.Tone.Reverb({ decay: 2.5, wet: 0.25 }).toDestination();
    const synth = new window.Tone.PolySynth(window.Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.5, release: 1.2 },
    }).connect(reverb);
    synth.volume.value = -10;
    synthRef.current = synth;
    const metro = new window.Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).toDestination();
    metro.volume.value = -18;
    metronomeRef.current = metro;
  }, [toneReady]);

  useEffect(() => {
    if (!toneReady || !window.Tone) return;
    window.Tone.Transport.bpm.value = bpm;
    if (isMetronomeOn) {
      window.Tone.start();
      const loop = new window.Tone.Loop((time) => { metronomeRef.current?.triggerAttackRelease("C2","32n",time); }, "4n").start(0);
      window.Tone.Transport.start();
      return () => { loop.dispose(); window.Tone.Transport.stop(); };
    }
  }, [isMetronomeOn, bpm, toneReady]);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiStatus("unsupported"); return; }
    navigator.requestMIDIAccess().then(
      (access) => {
        const updateInputs = () => { const inputs = Array.from(access.inputs.values()); setMidiInputs(inputs); setMidiStatus(inputs.length > 0 ? "connected" : "no-devices"); };
        updateInputs(); access.onstatechange = updateInputs;
      },
      () => setMidiStatus("denied")
    );
  }, []);

  useEffect(() => { if (midiInputs.length > 0 && !selectedInputId) setSelectedInputId(midiInputs[0].id); }, [midiInputs, selectedInputId]);

  useEffect(() => {
    if (!selectedInputId) return;
    const input = midiInputs.find((i) => i.id === selectedInputId);
    if (!input) return;
    const handler = (msg) => {
      const [status, pitch, velocity] = msg.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && velocity > 0) handleNoteOn(pitch, velocity);
      else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) handleNoteOff(pitch);
    };
    input.onmidimessage = handler;
    return () => { input.onmidimessage = null; };
  }, [selectedInputId, midiInputs]);

  useEffect(() => {
    const downKeys = new Set();
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNoteId) {
        e.preventDefault(); setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId)); setSelectedNoteId(null); return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (viewRef.current === "composer") {
          if (isComposerPlayingRef.current) stopComposerPlaybackRef.current();
          else playComposerFromCursorRef.current();
        } else if (viewRef.current === "producer") {
          if (isProducerPlayingRef.current) stopProducerPlaybackRef.current();
          else playProducerNotesRef.current();
        }
        return;
      }
      const offset = QWERTY_MAP[e.key.toLowerCase()];
      if (offset === undefined) return;
      e.preventDefault();
      const pitch = 60 + offset + octaveShift * 12;
      if (pitch < 0 || pitch > 127) return;
      if (downKeys.has(e.key)) return;
      downKeys.add(e.key); handleNoteOn(pitch, 90);
    };
    const onKeyUp = (e) => {
      const offset = QWERTY_MAP[e.key.toLowerCase()];
      if (offset === undefined) return;
      downKeys.delete(e.key); handleNoteOff(60 + offset + octaveShift * 12);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [octaveShift, selectedNoteId]);

  useEffect(() => {
    const stopVoice = () => {
      if (voiceProcessorRef.current) { voiceProcessorRef.current.disconnect(); voiceProcessorRef.current = null; }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
      if (voiceAudioCtxRef.current) { voiceAudioCtxRef.current.close(); voiceAudioCtxRef.current = null; }
      if (voiceActivePitchRef.current !== null) { handleNoteOff(voiceActivePitchRef.current); voiceActivePitchRef.current = null; setVoicePitch(null); }
      voiceStableRef.current = { pitch: null, count: 0 };
    };
    if (inputMode !== "voice") { stopVoice(); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
      .then((stream) => {
        micStreamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 44100 });
        voiceAudioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        voiceProcessorRef.current = processor;
        processor.onaudioprocess = (e) => {
          const buf = e.inputBuffer.getChannelData(0);
          const freq = yinDetect(buf, ctx.sampleRate);
          const midi = (freq > 60 && freq < 1500) ? freqToMidi(freq) : null;
          const stable = voiceStableRef.current;
          if (midi === stable.pitch) { stable.count++; } else { stable.pitch = midi; stable.count = 1; }
          if (stable.count === 2) {
            const prev = voiceActivePitchRef.current;
            if (midi !== prev) {
              if (prev !== null) handleNoteOff(prev);
              if (midi !== null) handleNoteOn(midi, 80);
              voiceActivePitchRef.current = midi;
              setVoicePitch(midi);
            }
          }
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      })
      .catch(() => setInputMode("midi"));
    return stopVoice;
  }, [inputMode]);

  useEffect(() => {
    const tick = () => {
      const t = performance.now() / 1000;
      setNow(t);
      visualEventsRef.current = visualEventsRef.current.filter((e) => !e.finalized || t - e.releaseTime < 5);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleNoteOn = useCallback((pitch, velocity) => {
    const t = performance.now() / 1000;
    if (synthRef.current && window.Tone) {
      window.Tone.start();
      synthRef.current.triggerAttack(window.Tone.Frequency(pitch, "midi").toFrequency(), undefined, velocity / 127);
    }
    activeNotesRef.current.set(pitch, { startTime: t, velocity });
    setActiveNotes(new Map(activeNotesRef.current));
    visualEventsRef.current.push({ id: Math.random(), pitch, velocity, startTime: t, releaseTime: null, finalized: false });
    if (viewRef.current === "composer") {
      if (composerActiveRef.current.size === 0) {
        let startBeat = composerCursorRef.current;
        if (quantizeLiveRef.current) {
          const q = composerDurationRef.current;
          startBeat = Math.round(startBeat / q) * q;
        }
        composerGroupStartBeatRef.current = startBeat;
        composerGroupEndBeatRef.current = startBeat;
      }
      composerActiveRef.current.set(pitch, { startBeat: composerGroupStartBeatRef.current, startTime: t, velocity });
    }
  }, []);

  const handleNoteOff = useCallback((pitch) => {
    const t = performance.now() / 1000;
    if (synthRef.current && window.Tone) synthRef.current.triggerRelease(window.Tone.Frequency(pitch, "midi").toFrequency());
    const active = activeNotesRef.current.get(pitch);
    if (active) {
      activeNotesRef.current.delete(pitch);
      setActiveNotes(new Map(activeNotesRef.current));
      if (isRecordingRef.current && viewRef.current !== "composer" && recordStartRef.current !== null) {
        setNotes((prev) => [...prev, { id: `${t}-${pitch}-${Math.random()}`, pitch, velocity: active.velocity, startTime: active.startTime - recordStartRef.current, endTime: t - recordStartRef.current }]);
      }
    }
    if (viewRef.current === "composer") {
      const cActive = composerActiveRef.current.get(pitch);
      if (cActive) {
        composerActiveRef.current.delete(pitch);
        let durationBeats = Math.max(0.1, (t - cActive.startTime) * (bpmRef.current / 60));
        if (quantizeLiveRef.current) {
          const q = composerDurationRef.current;
          durationBeats = Math.max(q, Math.round(durationBeats / q) * q);
        }
        composerGroupEndBeatRef.current = Math.max(composerGroupEndBeatRef.current, cActive.startBeat + durationBeats);
        setComposerNotes((prev) => [...prev, { id: `${t}-${pitch}-${Math.random()}`, pitch, velocity: cActive.velocity, startBeat: cActive.startBeat, durationBeats }]);
        if (composerActiveRef.current.size === 0) {
          setComposerCursorAbsolute(composerGroupEndBeatRef.current);
          composerGroupStartBeatRef.current = null;
        }
      }
    }
    for (let i = visualEventsRef.current.length - 1; i >= 0; i--) {
      const ev = visualEventsRef.current[i];
      if (ev.pitch === pitch && !ev.finalized) { ev.releaseTime = t; ev.finalized = true; break; }
    }
  }, []);

  const stopProducerPlayback = useCallback(() => {
    for (const id of producerPlayTimeoutsRef.current) clearTimeout(id);
    producerPlayTimeoutsRef.current = [];
    producerPlayStartRef.current = null;
    synthRef.current?.releaseAll?.();
    setIsProducerPlaying(false);
  }, []);

  const playProducerNotes = useCallback(() => {
    stopProducerPlayback();
    if (!synthRef.current || !window.Tone || notes.length === 0) return;
    window.Tone.start();
    producerPlayStartRef.current = { wallTime: performance.now() };
    for (const n of notes) {
      const freq = window.Tone.Frequency(n.pitch, "midi").toFrequency();
      producerPlayTimeoutsRef.current.push(
        setTimeout(() => synthRef.current?.triggerAttack(freq, undefined, n.velocity / 127), n.startTime * 1000),
        setTimeout(() => synthRef.current?.triggerRelease(freq), n.endTime * 1000)
      );
    }
    const endMs = Math.max(...notes.map(n => n.endTime)) * 1000;
    producerPlayTimeoutsRef.current.push(
      setTimeout(() => { producerPlayStartRef.current = null; setIsProducerPlaying(false); }, endMs + 150)
    );
    setIsProducerPlaying(true);
  }, [notes, stopProducerPlayback]);

  const startRecording = () => {
    stopProducerPlayback();
    recordStartRef.current = performance.now() / 1000;
    setNotes([]); setSelectedNoteId(null); setIsRecording(true); setAutoFollow(true); setScrollX(0);
  };
  const stopRecording = () => {
    setIsRecording(false);
    const t = performance.now() / 1000;
    const held = [];
    for (const [pitch, info] of activeNotesRef.current) {
      held.push({ id: `${t}-${pitch}-${Math.random()}`, pitch, velocity: info.velocity, startTime: info.startTime - recordStartRef.current, endTime: t - recordStartRef.current });
    }
    if (held.length > 0) setNotes((prev) => [...prev, ...held]);
    setAutoFollow(false);
  };
  const clearNotes = () => { stopProducerPlayback(); setNotes([]); setSelectedNoteId(null); setScrollX(0); recordStartRef.current = null; };

  const setComposerCursorAbsolute = useCallback((newCursor) => {
    composerCursorRef.current = newCursor;
    setComposerCursor(newCursor);
    setComposerBracket(bracket => {
      const width = bracket.endBeat - bracket.startBeat;
      if (newCursor >= bracket.endBeat) return { startBeat: Math.max(0, newCursor - width), endBeat: newCursor };
      return bracket;
    });
    if (composerCanvasRef.current) {
      const vw = composerCanvasRef.current.clientWidth - PRODUCER_KEYBOARD_WIDTH;
      const cursorPx = newCursor * COMPOSER_PX_PER_BEAT;
      setComposerScrollX(sx => cursorPx > sx + vw - 150 ? Math.max(0, cursorPx - vw + 150) : sx);
    }
  }, []);

  const advanceCursor = useCallback((beats) => {
    setComposerCursorAbsolute(composerCursorRef.current + beats);
  }, [setComposerCursorAbsolute]);

  const acceptSuggestion = useCallback((nc, avgPitch) => {
    const pitches = voiceChordNear(nc.pcs, avgPitch);
    const startBeat = composerCursorRef.current;
    const dur = composerDurationRef.current;
    setComposerNotes(prev => [...prev, ...pitches.map(pitch => ({
      id: `${Date.now()}-${pitch}-${Math.random()}`, pitch, velocity: 90, startBeat, durationBeats: dur,
    }))]);
    if (synthRef.current && window.Tone) {
      window.Tone.start();
      for (const p of pitches) synthRef.current.triggerAttack(window.Tone.Frequency(p, "midi").toFrequency(), undefined, 0.7);
      setTimeout(() => { for (const p of pitches) synthRef.current?.triggerRelease(window.Tone.Frequency(p, "midi").toFrequency()); }, 600);
    }
    setComposerCursorAbsolute(startBeat + dur);
  }, [setComposerCursorAbsolute]);

  const quantizeComposerNotes = useCallback(() => {
    const q = composerDuration;
    setComposerNotes(prev => prev.map(n => {
      const startBeat = Math.round(n.startBeat / q) * q;
      const durationBeats = Math.max(q, Math.round(n.durationBeats / q) * q);
      return { ...n, startBeat, durationBeats };
    }));
  }, [composerDuration]);

  const stopComposerPlayback = useCallback(() => {
    for (const id of composerPlayTimeoutsRef.current) clearTimeout(id);
    composerPlayTimeoutsRef.current = [];
    composerPlayStartRef.current = null;
    synthRef.current?.releaseAll?.();
    setIsComposerPlaying(false);
  }, []);

  const playComposerFromCursor = useCallback(() => {
    stopComposerPlayback();
    if (!synthRef.current || !window.Tone || composerNotes.length === 0) return;
    window.Tone.start();
    const lastEnd = Math.max(...composerNotes.map(n => n.startBeat + n.durationBeats));
    const startBeat = composerCursorRef.current >= lastEnd ? 0 : composerCursorRef.current;
    const beatMs = (60 / bpm) * 1000;
    const toPlay = composerNotes.filter(n => n.startBeat >= startBeat);
    if (toPlay.length === 0) return;
    composerPlayStartRef.current = { wallTime: performance.now(), beat: startBeat };
    for (const n of toPlay) {
      const delayMs = (n.startBeat - startBeat) * beatMs;
      const durMs = n.durationBeats * beatMs;
      const freq = window.Tone.Frequency(n.pitch, "midi").toFrequency();
      composerPlayTimeoutsRef.current.push(
        setTimeout(() => synthRef.current?.triggerAttack(freq, undefined, n.velocity / 127), delayMs),
        setTimeout(() => synthRef.current?.triggerRelease(freq), delayMs + durMs)
      );
    }
    const lastBeat = Math.max(...toPlay.map(n => n.startBeat + n.durationBeats));
    composerPlayTimeoutsRef.current.push(
      setTimeout(() => { composerPlayStartRef.current = null; setIsComposerPlaying(false); }, (lastBeat - startBeat) * beatMs + 150)
    );
    setIsComposerPlaying(true);
  }, [composerNotes, bpm, stopComposerPlayback]);

  useEffect(() => { playComposerFromCursorRef.current = playComposerFromCursor; }, [playComposerFromCursor]);
  useEffect(() => { stopComposerPlaybackRef.current = stopComposerPlayback; }, [stopComposerPlayback]);
  useEffect(() => { playProducerNotesRef.current = playProducerNotes; }, [playProducerNotes]);
  useEffect(() => { stopProducerPlaybackRef.current = stopProducerPlayback; }, [stopProducerPlayback]);

  const noteNames = useMemo(() => getNoteNames(keyRoot, mode), [keyRoot, mode]);

  const context = useMemo(() => {
    const allNotes = [];
    const baseTime = recordStartRef.current || 0;
    for (const n of notes) allNotes.push({ pitch: n.pitch, velocity: n.velocity, startTime: n.startTime + baseTime });
    for (const [pitch, info] of activeNotes) allNotes.push({ pitch, velocity: info.velocity, startTime: info.startTime });
    for (const ev of visualEventsRef.current) {
      const dupe = allNotes.find((n) => n.pitch === ev.pitch && Math.abs(n.startTime - ev.startTime) < 0.05);
      if (!dupe) allNotes.push({ pitch: ev.pitch, velocity: ev.velocity, startTime: ev.startTime });
    }
    if (allNotes.length === 0) return { contextNotes: [], pcWeights: new Map(), chord: null, nextChords: [], suggestions: suggestNotes(null, [], keyRoot, mode) };
    const contextNotes = selectContextNotes(allNotes);
    const pcWeights = computePcWeightsFlat(contextNotes);
    const chord = inferChord(pcWeights, keyRoot, mode);
    const nextChords = chord?.roman ? predictNextChords(chord.roman, keyRoot, mode) : [];
    const suggestions = suggestNotes(chord, nextChords, keyRoot, mode);
    return { contextNotes, pcWeights, chord, nextChords, suggestions };
  }, [notes, activeNotes, keyRoot, mode]);

  const composerContext = useMemo(() => {
    if (view !== "composer") return null;
    const triads = diatonicTriads(keyRoot, mode);
    const tonic = triads[0];
    // Fallback whenever we can't pin down a specific "current chord" to build a prediction from
    // (nothing played yet, or what's playing doesn't resolve to a clean diatonic chord) — rather than
    // showing no suggestions at all, offer the key's own chords to get started from.
    const keySuggestions = tonic
      ? [{ ...tonic, probability: 1 }, ...predictNextChords(tonic.roman, keyRoot, mode, Infinity)]
      : [];
    const bracketNotes = composerNotes.filter(n => n.startBeat >= composerBracket.startBeat && n.startBeat < composerBracket.endBeat);
    if (bracketNotes.length === 0) {
      return { contextNotes: [], pcWeights: new Map(), chord: null, nextChords: [], allNextChords: keySuggestions, chordSequence: [], suggestions: suggestNotes(null, [], keyRoot, mode), avgPitch: 60 };
    }
    const asTimedNotes = bracketNotes.map(n => ({ pitch: n.pitch, velocity: n.velocity, startTime: n.startBeat }));
    const contextNotes = selectContextNotes(asTimedNotes);
    const pcWeights = computePcWeightsFlat(contextNotes);
    const chord = inferChord(pcWeights, keyRoot, mode);
    const nextChords = chord?.roman ? predictNextChords(chord.roman, keyRoot, mode) : [];
    const allNextChords = chord?.roman ? predictNextChords(chord.roman, keyRoot, mode, Infinity) : keySuggestions;
    const suggestions = suggestNotes(chord, nextChords, keyRoot, mode);
    const avgPitch = Math.round(bracketNotes.reduce((s, n) => s + n.pitch, 0) / bracketNotes.length);
    const groups = new Map();
    for (const n of bracketNotes) {
      const key = Math.round(n.startBeat * 1000) / 1000;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const chordSequence = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([startBeat, ns]) => ({
      startBeat,
      pcs: [...new Set(ns.map(n => pitchClass(n.pitch)))],
      avgPitch: Math.round(ns.reduce((s, n) => s + n.pitch, 0) / ns.length),
    }));
    return { contextNotes, pcWeights, chord, nextChords, allNextChords, chordSequence, suggestions, avgPitch };
  }, [composerNotes, composerBracket, keyRoot, mode, view]);

  const clearHoverPlayback = useCallback(() => {
    for (const id of hoverTimeoutsRef.current) clearTimeout(id);
    hoverTimeoutsRef.current = [];
    if (synthRef.current && window.Tone) {
      for (const p of hoverNotesRef.current) synthRef.current.triggerRelease(window.Tone.Frequency(p, "midi").toFrequency());
    }
    hoverNotesRef.current = [];
  }, []);

  const handleHoverSuggestion = useCallback((nc) => {
    setHoveredSuggestion(nc);
    clearHoverPlayback();
    if (!synthRef.current || !window.Tone) return;
    window.Tone.start();
    const avgPitch = (composerContext?.avgPitch ?? 60) + suggestionOctave * 12;
    const beatMs = (60 / bpm) * 1000;
    const unitMs = beatMs * composerDuration; // hold time follows the selected note length
    const playChord = (pcs, avgP, delayMs, holdMs) => {
      const voiced = voiceChordNear(pcs, avgP);
      const onId = setTimeout(() => {
        for (const p of voiced) synthRef.current?.triggerAttack(window.Tone.Frequency(p, "midi").toFrequency(), undefined, 0.7);
        hoverNotesRef.current = [...hoverNotesRef.current, ...voiced];
        const offId = setTimeout(() => {
          for (const p of voiced) synthRef.current?.triggerRelease(window.Tone.Frequency(p, "midi").toFrequency());
        }, holdMs);
        hoverTimeoutsRef.current.push(offId);
      }, delayMs);
      hoverTimeoutsRef.current.push(onId);
    };
    if (playWholeContext && composerContext?.chordSequence?.length) {
      let delay = 0;
      for (const grp of composerContext.chordSequence) {
        playChord(grp.pcs, grp.avgPitch, delay, unitMs * 0.85);
        delay += unitMs;
      }
      playChord(nc.pcs, avgPitch, delay, unitMs * 0.85);
    } else {
      playChord(nc.pcs, avgPitch, 0, unitMs * 1.1);
    }
  }, [composerContext, bpm, playWholeContext, clearHoverPlayback, suggestionOctave, composerDuration]);

  const handleLeaveSuggestion = useCallback(() => {
    setHoveredSuggestion(null);
    clearHoverPlayback();
  }, [clearHoverPlayback]);

  useEffect(() => {
    if (view !== "composer") { setHoveredSuggestion(null); clearHoverPlayback(); }
  }, [view, clearHoverPlayback]);

  const exportMidi = () => {
    if (notes.length === 0) { alert("Nothing to export yet — record something first!"); return; }
    const ticksPerQuarter = 480;
    const secondsPerTick = 60 / (bpm * ticksPerQuarter);
    const events = [];
    for (const n of notes) {
      const startTicks = Math.round(n.startTime / secondsPerTick);
      const endTicks = Math.round(n.endTime / secondsPerTick);
      events.push({ tick: startTicks, type: "on", pitch: n.pitch, vel: n.velocity });
      events.push({ tick: endTicks, type: "off", pitch: n.pitch, vel: 0 });
    }
    events.sort((a, b) => a.tick - b.tick || (a.type === "off" ? -1 : 1));
    const vlq = (n) => { const bytes = []; bytes.unshift(n & 0x7f); n >>= 7; while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; } return bytes; };
    const trackBytes = [];
    const usPerQuarter = Math.round(60000000 / bpm);
    trackBytes.push(0x00,0xff,0x51,0x03,(usPerQuarter>>16)&0xff,(usPerQuarter>>8)&0xff,usPerQuarter&0xff);
    let lastTick = 0;
    for (const ev of events) {
      const delta = ev.tick - lastTick; lastTick = ev.tick;
      trackBytes.push(...vlq(Math.max(0, delta)));
      if (ev.type === "on") trackBytes.push(0x90, ev.pitch, ev.vel);
      else trackBytes.push(0x80, ev.pitch, 0);
    }
    trackBytes.push(0x00,0xff,0x2f,0x00);
    const header = [0x4d,0x54,0x68,0x64,0x00,0x00,0x00,0x06,0x00,0x00,0x00,0x01,(ticksPerQuarter>>8)&0xff,ticksPerQuarter&0xff];
    const trackHeader = [0x4d,0x54,0x72,0x6b,(trackBytes.length>>24)&0xff,(trackBytes.length>>16)&0xff,(trackBytes.length>>8)&0xff,trackBytes.length&0xff];
    const bytes = new Uint8Array([...header, ...trackHeader, ...trackBytes]);
    const blob = new Blob([bytes], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `midimuse-${Date.now()}.mid`; a.click();
    URL.revokeObjectURL(url);
  };

  const rollDuration = useMemo(() => {
    const recordedDur = notes.length > 0 ? Math.max(...notes.map((n) => n.endTime)) : 0;
    const liveOffset = isRecording && recordStartRef.current ? (now - recordStartRef.current) : recordedDur;
    return Math.max(recordedDur, liveOffset) + 2;
  }, [notes, now, isRecording]);

  const rollWidthPx = rollDuration * ROLL_PX_PER_SEC;

  useEffect(() => {
    if (!isRecording || !autoFollow || !canvasRef.current) return;
    const liveOffset = recordStartRef.current ? (now - recordStartRef.current) : 0;
    const viewportWidth = canvasRef.current.clientWidth - PRODUCER_KEYBOARD_WIDTH;
    const playheadPx = liveOffset * ROLL_PX_PER_SEC;
    setScrollX(Math.max(0, playheadPx - viewportWidth * 0.7));
  }, [now, isRecording, autoFollow]);

  useEffect(() => {
    if (!isProducerPlaying || !producerPlayStartRef.current || !canvasRef.current) return;
    const elapsed = (performance.now() - producerPlayStartRef.current.wallTime) / 1000;
    const viewportWidth = canvasRef.current.clientWidth - PRODUCER_KEYBOARD_WIDTH;
    const playheadPx = elapsed * ROLL_PX_PER_SEC;
    setScrollX(Math.max(0, playheadPx - viewportWidth * 0.7));
  }, [now, isProducerPlaying]);

  const hitTestNote = (xPx, yPx, canvasWidth, canvasHeight) => {
    if (xPx < PRODUCER_KEYBOARD_WIDTH) return null;
    const rowHeight = (canvasHeight / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
    const timeAt = (xPx - PRODUCER_KEYBOARD_WIDTH + scrollX) / ROLL_PX_PER_SEC;
    const pitch = KEYBOARD_START + PITCH_RANGE - Math.floor(yPx / rowHeight) - 1;
    const hit = notes.find((n) => n.pitch === pitch && n.startTime <= timeAt && n.endTime >= timeAt);
    if (!hit) return null;
    const startPx = hit.startTime * ROLL_PX_PER_SEC - scrollX + PRODUCER_KEYBOARD_WIDTH;
    const endPx = hit.endTime * ROLL_PX_PER_SEC - scrollX + PRODUCER_KEYBOARD_WIDTH;
    let mode = "move";
    if (xPx - startPx < 6) mode = "resize-left";
    else if (endPx - xPx < 6) mode = "resize-right";
    return { note: hit, mode };
  };

  const onRollMouseDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x < PRODUCER_KEYBOARD_WIDTH) {
      const rowHeight = (rect.height / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
      const pitch = KEYBOARD_START + PITCH_RANGE - Math.floor(y / rowHeight) - 1;
      if (pitch >= 0 && pitch <= 127) {
        handleNoteOn(pitch, 90);
        const up = () => { handleNoteOff(pitch); window.removeEventListener("mouseup", up); };
        window.addEventListener("mouseup", up);
      }
      return;
    }
    if (isRecording) return;
    const hit = hitTestNote(x, y, rect.width, rect.height);
    if (hit) { setSelectedNoteId(hit.note.id); setDrag({ noteId: hit.note.id, mode: hit.mode, startX: x, startY: y, origNote: { ...hit.note } }); }
    else setSelectedNoteId(null);
  };

  const onRollMouseMove = (e) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const rowHeight = (rect.height / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
    const dTime = (x - drag.startX) / ROLL_PX_PER_SEC;
    const dPitch = -Math.round((y - drag.startY) / rowHeight);
    setNotes((prev) => prev.map((n) => {
      if (n.id !== drag.noteId) return n;
      const o = drag.origNote;
      if (drag.mode === "move") return { ...n, pitch: Math.max(0, Math.min(127, o.pitch + dPitch)), startTime: Math.max(0, o.startTime + dTime), endTime: Math.max(0.05, o.endTime + dTime) };
      if (drag.mode === "resize-left") return { ...n, startTime: Math.max(0, Math.min(o.endTime - 0.05, o.startTime + dTime)) };
      if (drag.mode === "resize-right") return { ...n, endTime: Math.max(o.startTime + 0.05, o.endTime + dTime) };
      return n;
    }));
  };

  const onRollMouseUp = () => setDrag(null);

  useEffect(() => {
    if (view !== "producer" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const noteNames = getNoteNames(keyRoot, mode);
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0e0e10"; ctx.fillRect(0, 0, cssW, cssH);
    const rollAreaX = PRODUCER_KEYBOARD_WIDTH, rollAreaW = cssW - rollAreaX;
    const rowHeight = (cssH / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      const y = cssH - (p - KEYBOARD_START + 1) * rowHeight;
      ctx.fillStyle = isBlackKey(p) ? "#151518" : "#1a1a1f"; ctx.fillRect(rollAreaX, y, rollAreaW, rowHeight);
      if (p % 12 === 0) { ctx.fillStyle = "#2a2a35"; ctx.fillRect(rollAreaX, y, rollAreaW, 1); }
    }
    const visibleStartSec = scrollX / ROLL_PX_PER_SEC, visibleEndSec = (scrollX + rollAreaW) / ROLL_PX_PER_SEC;
    const beatSec = 60 / bpm;
    for (let beat = Math.floor(visibleStartSec / beatSec); beat * beatSec < visibleEndSec; beat++) {
      const x = rollAreaX + (beat * beatSec - visibleStartSec) * ROLL_PX_PER_SEC;
      ctx.strokeStyle = beat % 4 === 0 ? "rgba(180,180,210,0.22)" : "rgba(120,120,140,0.09)";
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.stroke();
    }
    for (const n of notes) {
      if (n.endTime < visibleStartSec || n.startTime > visibleEndSec) continue;
      const x = rollAreaX + (n.startTime - visibleStartSec) * ROLL_PX_PER_SEC;
      const w = Math.max(2, (n.endTime - n.startTime) * ROLL_PX_PER_SEC);
      const y = cssH - (n.pitch - KEYBOARD_START + 1) * rowHeight;
      const suggestion = context.suggestions.get(pitchClass(n.pitch));
      const color = suggestion ? ROLE_COLORS[suggestion.role] : ROLE_COLORS.scale;
      ctx.fillStyle = color.light;
      const clipLeft = Math.max(x, rollAreaX), clipRight = Math.min(x + w, cssW);
      if (clipRight > clipLeft) ctx.fillRect(clipLeft, y + 1, clipRight - clipLeft, rowHeight - 2);
      if (n.id === selectedNoteId && clipRight > clipLeft) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(clipLeft-1, y, clipRight-clipLeft+2, rowHeight); }
    }
    if (isRecording && recordStartRef.current !== null) {
      const liveOffset = now - recordStartRef.current;
      for (const [pitch, info] of activeNotes) {
        if (pitch < KEYBOARD_START || pitch >= KEYBOARD_END) continue;
        const startRel = info.startTime - recordStartRef.current;
        const x = rollAreaX + (startRel - visibleStartSec) * ROLL_PX_PER_SEC;
        const w = Math.max(2, (liveOffset - startRel) * ROLL_PX_PER_SEC);
        const y = cssH - (pitch - KEYBOARD_START + 1) * rowHeight;
        ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.9;
        const cl = Math.max(x, rollAreaX), cr = Math.min(x + w, cssW);
        if (cr > cl) ctx.fillRect(cl, y + 1, cr - cl, rowHeight - 2);
        ctx.globalAlpha = 1;
      }
      const playheadX = rollAreaX + (liveOffset - visibleStartSec) * ROLL_PX_PER_SEC;
      if (playheadX >= rollAreaX) { ctx.strokeStyle = "#ff4d5e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, cssH); ctx.stroke(); }
    }
    if (isProducerPlaying && producerPlayStartRef.current) {
      const elapsed = (performance.now() - producerPlayStartRef.current.wallTime) / 1000;
      const playheadX = rollAreaX + (elapsed - visibleStartSec) * ROLL_PX_PER_SEC;
      if (playheadX >= rollAreaX && playheadX <= cssW) {
        ctx.strokeStyle = "#6ee86e"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, cssH); ctx.stroke();
        ctx.fillStyle = "#6ee86e";
        ctx.beginPath(); ctx.moveTo(playheadX - 5, 0); ctx.lineTo(playheadX + 5, 0); ctx.lineTo(playheadX, 8); ctx.fill();
      }
    }
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      const y = cssH - (p - KEYBOARD_START + 1) * rowHeight;
      const isActive = activeNotes.has(p);
      const suggestion = context.suggestions.get(pitchClass(p));
      const showSug = suggestion && suggestion.weight > 0.4 && suggestion.role !== "avoid";
      const color = suggestion ? ROLE_COLORS[suggestion.role] : ROLE_COLORS.scale;
      const keyLabel = noteNames[p % 12] + (p % 12 === 0 ? `${Math.floor(p/12)-1}` : "");
      if (isBlackKey(p)) {
        ctx.fillStyle = isActive ? color.light : "#0a0a0e"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, rowHeight);
        if (showSug && !isActive) { ctx.fillStyle = color.glow; ctx.globalAlpha = 0.3 + suggestion.weight * 0.5; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH-4, y+1, 4, rowHeight-2); ctx.globalAlpha = 1; }
        ctx.fillStyle = isActive ? "#0a0a0c" : "#d8d8e0"; ctx.font = "8px monospace"; ctx.fillText(keyLabel, 6, y+rowHeight-3);
      } else {
        ctx.fillStyle = isActive ? color.light : "#e8e8ea"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, rowHeight);
        ctx.fillStyle = "#c8c8cc"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, 1);
        if (showSug && !isActive) { ctx.fillStyle = color.glow; ctx.globalAlpha = 0.35 + suggestion.weight * 0.5; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH-4, y+1, 4, rowHeight-2); ctx.globalAlpha = 1; }
        ctx.fillStyle = isActive ? "#000" : "#33333c"; ctx.font = "9px monospace"; ctx.fillText(keyLabel, 6, y+rowHeight-3);
      }
    }
    ctx.fillStyle = "#2a2a35"; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH, 0, 1, cssH);
    const drawChordBracketVertical = (chord, barX, stemEndX, color, label) => {
      if (!chord || !chord.pcs || chord.pcs.length < 2) return;
      const ys = [];
      for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
        if (chord.pcs.includes(pitchClass(p))) ys.push(cssH - (p - KEYBOARD_START + 1) * rowHeight + rowHeight / 2);
      }
      if (ys.length < 2) return;
      ys.sort((a, b) => a - b);
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.globalAlpha = 0.95;
      // vertical bridge sits on the roll side (stemEndX), dots touch the keys (barX)
      ctx.beginPath(); ctx.moveTo(stemEndX, ys[0]); ctx.lineTo(stemEndX, ys[ys.length-1]); ctx.stroke();
      for (const y of ys) { ctx.beginPath(); ctx.moveTo(stemEndX,y); ctx.lineTo(barX,y); ctx.stroke(); ctx.beginPath(); ctx.arc(barX,y,2.5,0,Math.PI*2); ctx.fill(); }
      if (label) {
        const labelX = (barX + stemEndX) / 2;
        ctx.globalAlpha = 1; ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
        const tw = ctx.measureText(label).width + 8, th = 14, labelY = Math.max(14, ys[0] - 10);
        ctx.fillStyle = "#0a0a0c"; ctx.globalAlpha = 0.9; ctx.fillRect(labelX-tw/2, labelY-th+2, tw, th);
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(labelX-tw/2, labelY-th+2, tw, th);
        ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fillText(label, labelX, labelY); ctx.textAlign = "start";
      }
      ctx.restore();
    };
    if (context.chord) drawChordBracketVertical(context.chord, PRODUCER_KEYBOARD_WIDTH, PRODUCER_KEYBOARD_WIDTH + 26, ROLE_COLORS.chord.glow, context.chord.symbol);
    if (context.nextChords.length > 0) {
      const nc = context.nextChords[0];
      drawChordBracketVertical({ pcs: nc.pcs }, PRODUCER_KEYBOARD_WIDTH, PRODUCER_KEYBOARD_WIDTH + 44, ROLE_COLORS.leading.glow, buildChordSymbol(nc.rootPc, nc.quality, noteNames));
    }
  }, [view, notes, activeNotes, now, bpm, isRecording, isProducerPlaying, context, scrollX, selectedNoteId]);

  useEffect(() => {
    if (view !== "improv" || !improvCanvasRef.current) return;
    const canvas = improvCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const noteNames = getNoteNames(keyRoot, mode);
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#030308"; ctx.fillRect(0, 0, cssW, cssH);
    const whiteKeysList = [];
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) if (!isBlackKey(p)) whiteKeysList.push(p);
    const keyWidth = cssW / whiteKeysList.length;
    const pitchToX = (pitch) => {
      let wi = 0; for (let p = KEYBOARD_START; p < pitch; p++) if (!isBlackKey(p)) wi++;
      return isBlackKey(pitch) ? (wi - 0.5) * keyWidth + keyWidth * 0.25 : wi * keyWidth;
    };
    const pitchWidthPx = (pitch) => isBlackKey(pitch) ? keyWidth * 0.55 : keyWidth;
    const keyboardHeight = 120, noteAreaHeight = cssH - keyboardHeight, fallSpeed = 180;
    for (const ev of visualEventsRef.current) {
      const effectiveEnd = ev.finalized ? ev.releaseTime : now;
      const holdDuration = Math.max(0, effectiveEnd - ev.startTime);
      const trailLen = holdDuration * fallSpeed;
      const timeSinceRelease = ev.finalized ? (now - ev.releaseTime) : 0;
      const headY = noteAreaHeight - timeSinceRelease * fallSpeed;
      const tailY = headY - trailLen;
      if (headY < -20) continue;
      const clipTop = Math.max(0, tailY), clipBottom = Math.min(noteAreaHeight, headY);
      if (clipBottom <= clipTop) continue;
      const x = pitchToX(ev.pitch), w = pitchWidthPx(ev.pitch), hue = (ev.pitch * 15) % 360;
      const fadeAfter = 2.5;
      const fade = ev.finalized ? Math.max(0, 1 - timeSinceRelease / fadeAfter) : 1;
      if (fade <= 0) continue;
      const trailGrad = ctx.createLinearGradient(0, tailY, 0, headY);
      trailGrad.addColorStop(0, `hsla(${hue},90%,70%,0)`); trailGrad.addColorStop(0.4, `hsla(${hue},90%,65%,${0.35*fade})`); trailGrad.addColorStop(1, `hsla(${hue},95%,70%,${0.95*fade})`);
      ctx.fillStyle = trailGrad; ctx.fillRect(x+2, clipTop, w-4, clipBottom-clipTop);
      const haloGrad = ctx.createLinearGradient(0, tailY, 0, headY);
      haloGrad.addColorStop(0, `hsla(${hue},90%,65%,0)`); haloGrad.addColorStop(1, `hsla(${hue},90%,60%,${0.25*fade})`);
      ctx.fillStyle = haloGrad; ctx.fillRect(x-w*0.3, clipTop, w*1.6, clipBottom-clipTop);
      if (headY > 0 && headY < noteAreaHeight+5) {
        const headRadius = w * 1.8;
        const glow = ctx.createRadialGradient(x+w/2,headY,0,x+w/2,headY,headRadius);
        glow.addColorStop(0, `hsla(${hue},100%,85%,${0.9*fade})`); glow.addColorStop(0.5, `hsla(${hue},95%,70%,${0.4*fade})`); glow.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        ctx.fillStyle = glow; ctx.fillRect(x-w, headY-headRadius, w*3, headRadius*2);
        ctx.fillStyle = `hsla(${hue},100%,92%,${fade})`; ctx.fillRect(x+2, headY-2, w-4, 3);
      }
    }
    const kbY = noteAreaHeight;
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      if (isBlackKey(p)) continue;
      const x = pitchToX(p), isActive = activeNotes.has(p);
      const suggestion = context.suggestions.get(pitchClass(p));
      const showSug = suggestion && suggestion.weight >= 0.3 && !isActive && suggestion.role !== "avoid";
      ctx.fillStyle = isActive ? `hsla(${(p*15)%360},100%,75%,1)` : "#15151a";
      ctx.fillRect(x+1, kbY+2, keyWidth-2, keyboardHeight-4);
      if (showSug) {
        const col = ROLE_COLORS[suggestion.role];
        ctx.fillStyle = col.glow; ctx.globalAlpha = 0.08 + suggestion.weight*0.12; ctx.fillRect(x+1,kbY+2,keyWidth-2,keyboardHeight-4); ctx.globalAlpha = 1;
        const stripH = 6 + suggestion.weight*10, stripGrad = ctx.createLinearGradient(0,kbY+2,0,kbY+2+stripH);
        stripGrad.addColorStop(0, col.glow); stripGrad.addColorStop(1, `${col.glow}00`);
        ctx.fillStyle = stripGrad; ctx.globalAlpha = 0.6*suggestion.weight; ctx.fillRect(x+1,kbY+2,keyWidth-2,stripH); ctx.globalAlpha = 1;
      }
      const wLabel = noteNames[p % 12] + (p % 12 === 0 ? `${Math.floor(p/12)-1}` : "");
      ctx.fillStyle = isActive ? "rgba(10,10,15,0.55)" : "rgba(190,190,225,0.45)";
      ctx.font = "10px sans-serif"; ctx.fillText(wLabel, x+3, kbY+keyboardHeight-6);
    }
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      if (!isBlackKey(p)) continue;
      const x = pitchToX(p), w = pitchWidthPx(p), isActive = activeNotes.has(p);
      const suggestion = context.suggestions.get(pitchClass(p));
      const showSug = suggestion && suggestion.weight >= 0.3 && !isActive && suggestion.role !== "avoid";
      const bkH = keyboardHeight * 0.65;
      ctx.fillStyle = isActive ? `hsla(${(p*15)%360},100%,70%,1)` : "#050507"; ctx.fillRect(x, kbY+2, w, bkH);
      if (showSug) {
        const col = ROLE_COLORS[suggestion.role];
        ctx.fillStyle = col.glow; ctx.globalAlpha = 0.12 + suggestion.weight*0.14; ctx.fillRect(x,kbY+2,w,bkH); ctx.globalAlpha = 1;
        const stripH = 5 + suggestion.weight*8, stripGrad = ctx.createLinearGradient(0,kbY+2,0,kbY+2+stripH);
        stripGrad.addColorStop(0, col.glow); stripGrad.addColorStop(1, `${col.glow}00`);
        ctx.fillStyle = stripGrad; ctx.globalAlpha = 0.7*suggestion.weight; ctx.fillRect(x,kbY+2,w,stripH); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = isActive ? "rgba(0,0,0,0.75)" : "rgba(210,210,235,0.5)";
      ctx.font = "9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(noteNames[p % 12], x + w/2, kbY + bkH - 5); ctx.textAlign = "start";
    }
    const chordXsInOneOctave = (pcs) => {
      const xs = [];
      for (const pc of pcs) {
        for (let p = 60; p < 72; p++) { if (pitchClass(p) === pc) { xs.push(pitchToX(p) + pitchWidthPx(p)/2); break; } }
      }
      return xs.sort((a,b) => a-b);
    };
    const drawHorizontalBracket = (chordPcs, color, barY, stemLen, label) => {
      if (!chordPcs || chordPcs.length < 2) return;
      const xs = chordXsInOneOctave(chordPcs);
      if (xs.length < 2) return;
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(xs[0],barY); ctx.lineTo(xs[xs.length-1],barY); ctx.stroke();
      for (const x of xs) { ctx.beginPath(); ctx.moveTo(x,barY); ctx.lineTo(x,barY+stemLen); ctx.stroke(); ctx.beginPath(); ctx.arc(x,barY+stemLen,2.5,0,Math.PI*2); ctx.fill(); }
      if (label) {
        ctx.globalAlpha = 1; ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
        const midX = (xs[0]+xs[xs.length-1])/2, tw = ctx.measureText(label).width+10, th = 18;
        ctx.fillStyle = "#050508"; ctx.globalAlpha = 0.85; ctx.fillRect(midX-tw/2, barY-th-4, tw, th);
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(midX-tw/2, barY-th-4, tw, th);
        ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fillText(label, midX, barY-8); ctx.textAlign = "start";
      }
      ctx.restore();
    };
    if (context.chord) drawHorizontalBracket(context.chord.pcs, ROLE_COLORS.chord.glow, kbY-50, 18, context.chord.symbol);
    if (context.nextChords.length > 0) {
      const nc = context.nextChords[0];
      drawHorizontalBracket(nc.pcs, ROLE_COLORS.leading.glow, kbY-85, 80, buildChordSymbol(nc.rootPc, nc.quality, noteNames));
    }
  }, [view, now, activeNotes, context]);

  useEffect(() => {
    if (view !== "composer" || !composerCanvasRef.current) return;
    const canvas = composerCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const noteNames = getNoteNames(keyRoot, mode);
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rollTop = COMPOSER_BRACKET_H;
    const rollH = cssH - rollTop;
    const rollAreaX = PRODUCER_KEYBOARD_WIDTH;
    const rollAreaW = cssW - rollAreaX;
    const rowHeight = (rollH / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
    const visStartBeat = composerScrollX / COMPOSER_PX_PER_BEAT;
    const visEndBeat = (composerScrollX + rollAreaW) / COMPOSER_PX_PER_BEAT;
    const beatToX = b => rollAreaX + (b - visStartBeat) * COMPOSER_PX_PER_BEAT;
    const pitchToY = p => rollTop + rollH - (p - KEYBOARD_START + 1) * rowHeight;

    // Backgrounds
    ctx.fillStyle = "#0e0e10"; ctx.fillRect(0, rollTop, cssW, rollH);
    ctx.fillStyle = "#0a0a0e"; ctx.fillRect(0, 0, cssW, COMPOSER_BRACKET_H);
    ctx.fillStyle = "#12121a"; ctx.fillRect(rollAreaX, 0, rollAreaW, COMPOSER_BRACKET_H);

    // Pitch row backgrounds
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      const y = pitchToY(p);
      ctx.fillStyle = isBlackKey(p) ? "#151518" : "#1a1a1f"; ctx.fillRect(rollAreaX, y, rollAreaW, rowHeight);
      if (p % 12 === 0) { ctx.fillStyle = "#2a2a35"; ctx.fillRect(rollAreaX, y, rollAreaW, 1); }
    }

    // Beat/bar grid + bar numbers in bracket lane
    const startBar = Math.floor(visStartBeat / 4);
    const endBar = Math.ceil(visEndBeat / 4);
    for (let bar = startBar; bar <= endBar + 1; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        const b = bar * 4 + beat;
        const x = beatToX(b);
        if (x < rollAreaX || x > cssW) continue;
        ctx.strokeStyle = beat === 0 ? "rgba(180,180,210,0.22)" : "rgba(120,120,140,0.09)";
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, rollTop); ctx.lineTo(x, cssH); ctx.stroke();
        if (beat === 0 && x + 4 < cssW) {
          ctx.fillStyle = "rgba(90,90,110,0.8)"; ctx.font = "9px monospace"; ctx.textAlign = "center";
          ctx.fillText(`${bar + 1}`, x, COMPOSER_BRACKET_H - 5); ctx.textAlign = "start";
        }
      }
    }

    // Context bracket
    const bStartX = beatToX(composerBracket.startBeat);
    const bEndX = beatToX(composerBracket.endBeat);
    const clStart = Math.max(rollAreaX, bStartX), clEnd = Math.min(cssW, bEndX);
    if (clEnd > clStart) {
      ctx.fillStyle = "rgba(130,90,220,0.12)"; ctx.fillRect(clStart, 0, clEnd - clStart, COMPOSER_BRACKET_H);
      // Also shade roll under bracket
      ctx.fillStyle = "rgba(130,90,220,0.04)"; ctx.fillRect(clStart, rollTop, clEnd - clStart, rollH);
    }
    // bracket top bar
    if (clEnd > clStart) {
      ctx.strokeStyle = "rgba(155,115,245,0.75)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(clStart, 3); ctx.lineTo(clEnd, 3); ctx.stroke();
    }
    // left handle
    if (bStartX >= rollAreaX && bStartX <= cssW) {
      ctx.strokeStyle = "rgba(180,145,255,0.9)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bStartX, 2); ctx.lineTo(bStartX, COMPOSER_BRACKET_H - 2); ctx.stroke();
    }
    // right handle
    if (bEndX >= rollAreaX && bEndX <= cssW) {
      ctx.strokeStyle = "rgba(180,145,255,0.9)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bEndX, 2); ctx.lineTo(bEndX, COMPOSER_BRACKET_H - 2); ctx.stroke();
    }
    // label
    if (clEnd > clStart) {
      const midX = (clStart + clEnd) / 2;
      ctx.fillStyle = "rgba(170,135,255,0.7)"; ctx.font = "8px monospace"; ctx.textAlign = "center";
      ctx.fillText("CONTEXT", midX, COMPOSER_BRACKET_H - 5); ctx.textAlign = "start";
    }

    // Placed notes
    for (const n of composerNotes) {
      if (n.startBeat + n.durationBeats < visStartBeat || n.startBeat > visEndBeat) continue;
      const x = beatToX(n.startBeat);
      const w = Math.max(2, n.durationBeats * COMPOSER_PX_PER_BEAT - 2);
      const y = pitchToY(n.pitch);
      const inBracket = n.startBeat >= composerBracket.startBeat && n.startBeat < composerBracket.endBeat;
      const sug = composerContext?.suggestions.get(pitchClass(n.pitch));
      const color = sug ? ROLE_COLORS[sug.role] : ROLE_COLORS.scale;
      ctx.fillStyle = color.light;
      ctx.globalAlpha = inBracket ? 1 : 0.45;
      const cl = Math.max(x, rollAreaX), cr = Math.min(x + w, cssW);
      if (cr > cl) ctx.fillRect(cl, y + 1, cr - cl, rowHeight - 2);
      ctx.globalAlpha = 1;
    }

    // Notes currently being held down — grow live while playing
    for (const [pitch, info] of composerActiveRef.current) {
      const liveBeats = Math.max(0.05, (now - info.startTime) * (bpm / 60));
      const x = beatToX(info.startBeat);
      const w = Math.max(2, liveBeats * COMPOSER_PX_PER_BEAT - 2);
      const y = pitchToY(pitch);
      const cl = Math.max(x, rollAreaX), cr = Math.min(x + w, cssW);
      if (cr > cl) { ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.9; ctx.fillRect(cl, y + 1, cr - cl, rowHeight - 2); ctx.globalAlpha = 1; }
    }

    const cursorX = beatToX(composerCursor);

    // Hovered suggestion-card chord — transparent placement preview at cursor (only shown while hovering a card)
    if (hoveredSuggestion && cursorX >= rollAreaX && cursorX < cssW) {
      const avgP = (composerContext?.avgPitch || 60) + suggestionOctave * 12;
      const voiced = voiceChordNear(hoveredSuggestion.pcs, avgP);
      const w = Math.max(2, composerDuration * COMPOSER_PX_PER_BEAT - 2);
      for (const p of voiced) {
        if (p < KEYBOARD_START || p >= KEYBOARD_END) continue;
        const y = pitchToY(p);
        const cw = Math.min(w, cssW - cursorX);
        ctx.fillStyle = ROLE_COLORS.leading.light; ctx.globalAlpha = 0.55;
        ctx.fillRect(cursorX, y + 1, cw, rowHeight - 2);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = ROLE_COLORS.leading.glow; ctx.lineWidth = 1.5;
        ctx.strokeRect(cursorX + 0.75, y + 1.75, Math.max(0, cw - 1.5), rowHeight - 3.5);
      }
      ctx.globalAlpha = 1;
      if (cursorX + 4 < cssW) {
        const label = `${noteNames[hoveredSuggestion.rootPc]}${QUALITY_NAMES[hoveredSuggestion.quality] ?? hoveredSuggestion.quality}`;
        ctx.font = "bold 11px monospace"; ctx.fillStyle = ROLE_COLORS.leading.glow; ctx.globalAlpha = 0.95;
        ctx.fillText(label, cursorX + 4, rollTop + 28);
        ctx.globalAlpha = 1;
      }
    }

    // Cursor line (amber head)
    if (cursorX >= rollAreaX && cursorX <= cssW) {
      ctx.strokeStyle = "#e8a040"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cursorX, rollTop); ctx.lineTo(cursorX, cssH); ctx.stroke();
      ctx.fillStyle = "#e8a040";
      ctx.beginPath(); ctx.moveTo(cursorX - 5, rollTop); ctx.lineTo(cursorX + 5, rollTop); ctx.lineTo(cursorX, rollTop + 8); ctx.fill();
    }
    // Moving playhead during playback
    if (isComposerPlaying && composerPlayStartRef.current) {
      const elapsed = (performance.now() - composerPlayStartRef.current.wallTime) / 1000;
      const playheadBeat = composerPlayStartRef.current.beat + elapsed * (bpm / 60);
      const phX = beatToX(playheadBeat);
      if (phX >= rollAreaX && phX <= cssW) {
        ctx.strokeStyle = "#ff4d5e"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(phX, rollTop); ctx.lineTo(phX, cssH); ctx.stroke();
        ctx.fillStyle = "#ff4d5e";
        ctx.beginPath(); ctx.moveTo(phX - 4, rollTop); ctx.lineTo(phX + 4, rollTop); ctx.lineTo(phX, rollTop + 7); ctx.fill();
      }
    }

    // Keyboard (same layout as producer)
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
      const y = pitchToY(p);
      const isActive = activeNotes.has(p);
      const suggestion = composerContext?.suggestions.get(pitchClass(p));
      const showSug = suggestion && suggestion.weight > 0.4 && suggestion.role !== "avoid";
      const color = suggestion ? ROLE_COLORS[suggestion.role] : ROLE_COLORS.scale;
      const keyLabel = noteNames[p % 12] + (p % 12 === 0 ? `${Math.floor(p / 12) - 1}` : "");
      if (isBlackKey(p)) {
        ctx.fillStyle = isActive ? color.light : "#0a0a0e"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, rowHeight);
        if (showSug && !isActive) { ctx.fillStyle = color.glow; ctx.globalAlpha = 0.3 + suggestion.weight * 0.5; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH - 4, y + 1, 4, rowHeight - 2); ctx.globalAlpha = 1; }
        ctx.fillStyle = isActive ? "#0a0a0c" : "#d8d8e0"; ctx.font = "8px monospace"; ctx.fillText(keyLabel, 6, y + rowHeight - 3);
      } else {
        ctx.fillStyle = isActive ? color.light : "#e8e8ea"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, rowHeight);
        ctx.fillStyle = "#c8c8cc"; ctx.fillRect(0, y, PRODUCER_KEYBOARD_WIDTH, 1);
        if (showSug && !isActive) { ctx.fillStyle = color.glow; ctx.globalAlpha = 0.35 + suggestion.weight * 0.5; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH - 4, y + 1, 4, rowHeight - 2); ctx.globalAlpha = 1; }
        ctx.fillStyle = isActive ? "#000" : "#33333c"; ctx.font = "9px monospace"; ctx.fillText(keyLabel, 6, y + rowHeight - 3);
      }
    }
    ctx.fillStyle = "#2a2a35"; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH, rollTop, 1, rollH);
    ctx.fillStyle = "#1a1a25"; ctx.fillRect(PRODUCER_KEYBOARD_WIDTH, 0, 1, COMPOSER_BRACKET_H);
  }, [view, composerNotes, composerBracket, composerCursor, composerScrollX, composerContext, composerDuration, activeNotes, isComposerPlaying, now, bpm, hoveredSuggestion, suggestionOctave]);

  const onComposerMouseDown = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    // Bracket lane
    if (y < COMPOSER_BRACKET_H && x >= PRODUCER_KEYBOARD_WIDTH) {
      const bStartX = composerBracket.startBeat * COMPOSER_PX_PER_BEAT - composerScrollX + PRODUCER_KEYBOARD_WIDTH;
      const bEndX = composerBracket.endBeat * COMPOSER_PX_PER_BEAT - composerScrollX + PRODUCER_KEYBOARD_WIDTH;
      const handle = 10;
      if (Math.abs(x - bStartX) < handle) setBracketDragState({ type: "resize-left", startX: x, origBracket: { ...composerBracket } });
      else if (Math.abs(x - bEndX) < handle) setBracketDragState({ type: "resize-right", startX: x, origBracket: { ...composerBracket } });
      else if (x > bStartX && x < bEndX) setBracketDragState({ type: "move", startX: x, origBracket: { ...composerBracket } });
      return;
    }
    // Piano keyboard click
    if (x < PRODUCER_KEYBOARD_WIDTH) {
      const rollH = rect.height - COMPOSER_BRACKET_H;
      const rowH = (rollH / PITCH_RANGE) * ROLL_ROW_HEIGHT_SCALE;
      const pitch = KEYBOARD_START + PITCH_RANGE - Math.floor((y - COMPOSER_BRACKET_H) / rowH) - 1;
      if (pitch >= KEYBOARD_START && pitch < KEYBOARD_END) {
        handleNoteOn(pitch, 90);
        const up = () => { handleNoteOff(pitch); window.removeEventListener("mouseup", up); };
        window.addEventListener("mouseup", up);
      }
      return;
    }
    // Click on suggestion ghost at cursor (only present while hovering a suggestion card)
    if (hoveredSuggestion) {
      const cursorX = composerCursor * COMPOSER_PX_PER_BEAT - composerScrollX + PRODUCER_KEYBOARD_WIDTH;
      const w = composerDuration * COMPOSER_PX_PER_BEAT;
      if (x >= cursorX && x <= cursorX + w) {
        acceptSuggestion(hoveredSuggestion, composerContext.avgPitch || 60);
        return;
      }
    }
    // Click on roll → snap head to nearest beat
    const clickBeat = (x - PRODUCER_KEYBOARD_WIDTH + composerScrollX) / COMPOSER_PX_PER_BEAT;
    const snapped = Math.max(0, Math.round(clickBeat));
    setComposerCursor(snapped);
    composerCursorRef.current = snapped;
  }, [composerBracket, composerScrollX, composerContext, composerCursor, composerDuration, handleNoteOn, handleNoteOff, acceptSuggestion, hoveredSuggestion]);

  const onComposerMouseMove = useCallback((e) => {
    if (!bracketDragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - rect.left - bracketDragState.startX) / COMPOSER_PX_PER_BEAT;
    const orig = bracketDragState.origBracket;
    const minW = 0.25;
    if (bracketDragState.type === "move") {
      const w = orig.endBeat - orig.startBeat;
      const ns = Math.max(0, orig.startBeat + dx);
      setComposerBracket({ startBeat: ns, endBeat: ns + w });
    } else if (bracketDragState.type === "resize-left") {
      setComposerBracket({ startBeat: Math.max(0, Math.min(orig.endBeat - minW, orig.startBeat + dx)), endBeat: orig.endBeat });
    } else if (bracketDragState.type === "resize-right") {
      setComposerBracket({ startBeat: orig.startBeat, endBeat: Math.max(orig.startBeat + minW, orig.endBeat + dx) });
    }
  }, [bracketDragState]);

  const onComposerMouseUp = useCallback(() => setBracketDragState(null), []);

  const exportComposerMidi = useCallback(() => {
    if (composerNotes.length === 0) { alert("Nothing to export!"); return; }
    const tpq = 480;
    const events = [];
    for (const n of composerNotes) {
      const st = Math.round(n.startBeat * tpq), et = Math.round((n.startBeat + n.durationBeats) * tpq);
      events.push({ tick: st, type: "on", pitch: n.pitch, vel: n.velocity });
      events.push({ tick: et, type: "off", pitch: n.pitch, vel: 0 });
    }
    events.sort((a, b) => a.tick - b.tick || (a.type === "off" ? -1 : 1));
    const vlq = n => { const b = []; b.unshift(n & 0x7f); n >>= 7; while (n > 0) { b.unshift((n & 0x7f) | 0x80); n >>= 7; } return b; };
    const tb = [];
    const usp = Math.round(60000000 / bpm);
    tb.push(0x00,0xff,0x51,0x03,(usp>>16)&0xff,(usp>>8)&0xff,usp&0xff);
    let last = 0;
    for (const ev of events) { const d = ev.tick - last; last = ev.tick; tb.push(...vlq(Math.max(0,d))); if (ev.type==="on") tb.push(0x90,ev.pitch,ev.vel); else tb.push(0x80,ev.pitch,0); }
    tb.push(0x00,0xff,0x2f,0x00);
    const hdr = [0x4d,0x54,0x68,0x64,0x00,0x00,0x00,0x06,0x00,0x00,0x00,0x01,(tpq>>8)&0xff,tpq&0xff];
    const th = [0x4d,0x54,0x72,0x6b,(tb.length>>24)&0xff,(tb.length>>16)&0xff,(tb.length>>8)&0xff,tb.length&0xff];
    const bytes = new Uint8Array([...hdr,...th,...tb]);
    const url = URL.createObjectURL(new Blob([bytes],{type:"audio/midi"}));
    const a = document.createElement("a"); a.href=url; a.download=`composer-${Date.now()}.mid`; a.click();
    URL.revokeObjectURL(url);
  }, [composerNotes, bpm]);

  const handleImprovKeyboardClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top, kbY = rect.height - 120;
    if (y < kbY) return;
    const x = e.clientX - rect.left;
    const whiteKeysList = [];
    for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) if (!isBlackKey(p)) whiteKeysList.push(p);
    const keyWidth = rect.width / whiteKeysList.length;
    const pitchToX = (pitch) => { let wi = 0; for (let p = KEYBOARD_START; p < pitch; p++) if (!isBlackKey(p)) wi++; return isBlackKey(pitch) ? (wi-0.5)*keyWidth+keyWidth*0.25 : wi*keyWidth; };
    const pitchWidth = (pitch) => isBlackKey(pitch) ? keyWidth*0.55 : keyWidth;
    if (y < kbY + 120 * 0.65) {
      for (let p = KEYBOARD_START; p < KEYBOARD_END; p++) {
        if (!isBlackKey(p)) continue;
        const bx = pitchToX(p), bw = pitchWidth(p);
        if (x >= bx && x <= bx+bw) { handleNoteOn(p,95); const up = () => { handleNoteOff(p); window.removeEventListener("mouseup",up); }; window.addEventListener("mouseup",up); return; }
      }
    }
    const pitch = whiteKeysList[Math.max(0, Math.min(whiteKeysList.length-1, Math.floor(x/keyWidth)))];
    handleNoteOn(pitch, 95);
    const up = () => { handleNoteOff(pitch); window.removeEventListener("mouseup",up); }; window.addEventListener("mouseup",up);
  };

  const producerStyle = view !== "improv";
  const activeFont = producerStyle ? PRODUCER_FONT : IMPROV_FONT;

  return (
    <div style={{ minHeight:"100vh", fontFamily:activeFont, background:producerStyle?"#0a0a0c":"#020206", color:producerStyle?"#d8d8e0":"#f0f0ff", display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"12px 20px", borderBottom:producerStyle?"1px solid #1a1a20":"1px solid #151530", background:producerStyle?"#0e0e12":"rgba(10,10,30,0.5)", flexWrap:"wrap" }}>
        <div style={{ fontFamily:activeFont, fontWeight:producerStyle?600:700, letterSpacing:producerStyle?"0.15em":"0.05em", fontSize:producerStyle?14:28, color:producerStyle?"#a0a0b0":"#e8d8ff", textShadow:producerStyle?"none":"0 0 10px rgba(200,150,255,0.3)" }}>
          {producerStyle ? "MIDI·MUSE" : "Midi Muse"}
        </div>
        <div style={{ display:"flex", border:"1px solid #2a2a35", borderRadius:4 }}>
          <button onClick={() => setView("producer")} style={{ padding:"6px 14px", fontSize:12, background:view==="producer"?"#2a2a40":"transparent", color:view==="producer"?"#fff":"#888", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontFamily:UI_FONT }}>PRODUCE</button>
          <button onClick={() => setView("composer")} style={{ padding:"6px 14px", fontSize:12, background:view==="composer"?"#1a2a3a":"transparent", color:view==="composer"?"#e8a040":"#888", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontFamily:UI_FONT }}>COMPOSE</button>
          <button onClick={() => setView("improv")} style={{ padding:"6px 14px", fontSize:12, background:view==="improv"?"#3a1a5a":"transparent", color:view==="improv"?"#fff":"#888", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontFamily:UI_FONT }}>IMPROV</button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:UI_FONT }}>
          <span style={{ color:"#777" }}>KEY</span>
          <PillDropdown value={keyRoot} swatchColor="#8a5cf6" width={78}
            options={KEY_NAMES.map((n, i) => ({ value: i, label: n }))}
            onChange={(v) => setKeyRoot(Number(v))} />
          <PillDropdown value={mode} width={100}
            options={ALL_MODES.map((m) => ({ value: m, label: m }))}
            onChange={setMode} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:UI_FONT }}>
          <span style={{ color:"#777" }}>BPM</span>
          <input type="number" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(240, Number(e.target.value)||100)))} style={{ ...ctrlStyle, width:56 }} />
          <button onClick={() => setIsMetronomeOn(!isMetronomeOn)} style={{ ...ctrlStyle, background:isMetronomeOn?"#3d5a1a":"transparent", color:isMetronomeOn?"#a8ef6a":"#888", cursor:"pointer" }} title="Toggle metronome">♩</button>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {!isRecording
            ? <button onClick={startRecording} style={{ ...ctrlStyle, background:"#5a1a20", color:"#ff8a95", cursor:"pointer" }}>● REC</button>
            : <button onClick={stopRecording} style={{ ...ctrlStyle, background:"#ff4d5e", color:"#fff", cursor:"pointer" }}>■ STOP</button>}
          {notes.length > 0 && (!isProducerPlaying
            ? <button onClick={playProducerNotes} style={{ ...ctrlStyle, background:"#1a3a1a", color:"#6ee86e", cursor:"pointer" }}>▶ PLAY</button>
            : <button onClick={stopProducerPlayback} style={{ ...ctrlStyle, background:"#3a1a1a", color:"#ff8a8a", cursor:"pointer" }}>■ STOP</button>)}
          <button onClick={exportMidi} style={{ ...ctrlStyle, cursor:"pointer" }}>⬇ MIDI</button>
          <button onClick={clearNotes} style={{ ...ctrlStyle, cursor:"pointer" }}>CLEAR</button>
        </div>
        <div style={{ display:"flex", border:"1px solid #2a2a35", borderRadius:4, marginLeft:"auto" }}>
          <button onClick={() => setInputMode("midi")} style={{ padding:"6px 14px", fontSize:12, background:inputMode==="midi"?"#2a2a40":"transparent", color:inputMode==="midi"?"#fff":"#888", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontFamily:UI_FONT }}>MIDI</button>
          <button onClick={() => setInputMode("voice")} style={{ padding:"6px 14px", fontSize:12, background:inputMode==="voice"?"#1a3a2a":"transparent", color:inputMode==="voice"?"#5ee8a0":"#888", border:"none", cursor:"pointer", letterSpacing:"0.1em", fontFamily:UI_FONT }}>VOICE</button>
        </div>
        {inputMode === "midi" && (
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontFamily:UI_FONT }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:midiStatus==="connected"?"#5ee08e":midiStatus==="no-devices"?"#e0b85e":"#e05e5e" }} />
            {midiInputs.length > 0
              ? <select value={selectedInputId||""} onChange={(e) => setSelectedInputId(e.target.value)} style={{ ...ctrlStyle, maxWidth:180 }}>{midiInputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
              : <span style={{ color:"#888" }}>{midiStatus==="unsupported"?"MIDI unsupported":midiStatus==="denied"?"MIDI denied":"No MIDI · use A–K keys"}</span>}
          </div>
        )}
        {inputMode === "voice" && (
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontFamily:UI_FONT }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:voicePitch!==null?"#5ee08e":"#555", boxShadow:voicePitch!==null?"0 0 6px #5ee08e":"none" }} />
            <span style={{ color:"#888", minWidth:60 }}>{voicePitch!==null ? `${noteNames[voicePitch%12]}${Math.floor(voicePitch/12)-1}` : "listening…"}</span>
          </div>
        )}
      </div>

      {view === "producer" && (
        <div style={{ padding:"8px 16px", borderBottom:"1px solid #1a1a20", background:"#0b0b0e", display:"flex", gap:16, alignItems:"center", fontSize:12, flexWrap:"wrap", fontFamily:UI_FONT }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:"1 1 320px", minWidth:0 }}>
            <span style={{ color:"#666", fontSize:11, whiteSpace:"nowrap" }}>CONTEXT</span>
            <div style={{ display:"flex", gap:4, overflowX:"auto", scrollbarWidth:"thin", padding:"2px 0", flex:1 }}>
              {context.contextNotes.length > 0 ? context.contextNotes.map((n, idx) => {
                const pc = pitchClass(n.pitch), sug = context.suggestions.get(pc), role = sug?.role || "scale", col = ROLE_COLORS[role];
                return <div key={`${idx}-${n.pitch}-${n.startTime}`} style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 7px", background:col.light, color:"#0a0a0c", borderRadius:3, fontSize:10, fontWeight:600, fontFamily:UI_FONT, whiteSpace:"nowrap", flexShrink:0 }} title={`${noteNames[pc]}${Math.floor(n.pitch/12)-1} — ${role}`}>{noteNames[pc]}<span style={{ fontSize:8, opacity:0.7 }}>{Math.floor(n.pitch/12)-1}</span></div>;
              }) : <span style={{ color:"#555", fontSize:11 }}>— waiting for input</span>}
            </div>
          </div>
          <div style={{ whiteSpace:"nowrap" }}>
            <span style={{ color:"#666" }}>CHORD </span>
            <span style={{ color:"#8ce4ff", fontWeight:600 }}>{context.chord ? context.chord.symbol : "—"}</span>
            {context.chord?.roman && <span style={{ color:"#c8a8ff", marginLeft:6 }}>({context.chord.roman})</span>}
          </div>
          <div style={{ whiteSpace:"nowrap" }}>
            <span style={{ color:"#666" }}>NEXT </span>
            {context.nextChords.length > 0 ? context.nextChords.slice(0,2).map((nc,i) => (
              <span key={i} style={{ color:"#a0f5c4", marginRight:8 }}>{noteNames[nc.rootPc]}{QUALITY_NAMES[nc.quality]??""}<span style={{ color:"#555", marginLeft:2, fontSize:10 }}>{Math.round(nc.probability*100)}%</span></span>
            )) : <span style={{ color:"#555" }}>—</span>}
          </div>
          {selectedNoteId && <div style={{ color:"#ff8a95", fontSize:11, whiteSpace:"nowrap" }}>◆ drag · Del to remove</div>}
          <div style={{ marginLeft:"auto", color:"#555", fontSize:11, whiteSpace:"nowrap" }}>
            OCT <button onClick={() => setOctaveShift(o => o-1)} style={miniBtn}>−</button>{octaveShift + 4}<button onClick={() => setOctaveShift(o => o+1)} style={miniBtn}>+</button>
          </div>
        </div>
      )}

      {view === "producer" ? (
        <>
          <div style={{ flex:1, position:"relative", minHeight:400 }}>
            <canvas ref={canvasRef} onMouseDown={onRollMouseDown} onMouseMove={onRollMouseMove} onMouseUp={onRollMouseUp} onMouseLeave={onRollMouseUp}
              style={{ width:"100%", height:"100%", display:"block", position:"absolute", inset:0, cursor:drag?(drag.mode==="move"?"grabbing":"ew-resize"):"default" }} />
          </div>
          {notes.length > 0 && (
            <div style={{ height:24, background:"#0b0b0e", borderTop:"1px solid #1a1a20", padding:"0 10px", display:"flex", alignItems:"center", gap:8, fontSize:10, color:"#666", fontFamily:UI_FONT }}>
              <input type="range" min={0} max={Math.max(1, rollWidthPx - Math.max(100, (canvasRef.current?.clientWidth||1000)-PRODUCER_KEYBOARD_WIDTH))} value={scrollX} step={1}
                onChange={(e) => { setScrollX(Number(e.target.value)); setAutoFollow(false); }} style={{ flex:1 }} />
              <span>{(scrollX/ROLL_PX_PER_SEC).toFixed(1)}s / {rollDuration.toFixed(1)}s</span>
              {isRecording && !autoFollow && <button onClick={() => setAutoFollow(true)} style={{ ...ctrlStyle, fontSize:10, padding:"2px 6px", cursor:"pointer" }}>FOLLOW</button>}
            </div>
          )}
        </>
      ) : view === "composer" ? (
        <>
          <div style={{ flex:1, position:"relative", minHeight:400 }}>
            <canvas ref={composerCanvasRef}
              onMouseDown={onComposerMouseDown} onMouseMove={onComposerMouseMove}
              onMouseUp={onComposerMouseUp} onMouseLeave={onComposerMouseUp}
              style={{ width:"100%", height:"100%", display:"block", position:"absolute", inset:0,
                cursor: bracketDragState ? (bracketDragState.type==="move" ? "grab" : "ew-resize") : "default" }} />
          </div>
          {composerNotes.length > 0 && (
            <div style={{ height:24, background:"#0b0b0e", borderTop:"1px solid #1a1a20", padding:"0 10px", display:"flex", alignItems:"center", gap:8, fontSize:10, color:"#666", fontFamily:UI_FONT }}>
              <input type="range" min={0} max={Math.max(1, composerCursor * COMPOSER_PX_PER_BEAT + 400)} value={composerScrollX} step={1}
                onChange={e => setComposerScrollX(Number(e.target.value))} style={{ flex:1 }} />
              <span>bar {Math.floor(composerScrollX / (COMPOSER_PX_PER_BEAT * 4)) + 1}</span>
            </div>
          )}
          <div style={{ padding:"10px 16px", borderTop:"1px solid #1a1a20", background:"#0b0b0e", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", fontFamily:UI_FONT }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
              <span style={{ color:"#666", marginRight:2 }}>NOTE</span>
              {COMPOSER_DURATIONS.map(d => (
                <button key={d.beats} onClick={() => setComposerDuration(d.beats)}
                  style={{ ...ctrlStyle, background:composerDuration===d.beats?"#2a3a50":"transparent", color:composerDuration===d.beats?"#8ce4ff":"#666", cursor:"pointer" }}>
                  {d.label}
                </button>
              ))}
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#888", cursor:"pointer" }}>
              <input type="checkbox" checked={quantizeLive} onChange={(e) => setQuantizeLive(e.target.checked)} />
              quantize live play to nearest {COMPOSER_DURATIONS.find(d => d.beats === composerDuration)?.label ?? "note"}
            </label>
            <button onClick={quantizeComposerNotes} disabled={composerNotes.length === 0} style={{ ...ctrlStyle, cursor:composerNotes.length===0?"default":"pointer", opacity:composerNotes.length===0?0.4:1 }}>
              quantize to {COMPOSER_DURATIONS.find(d => d.beats === composerDuration)?.label ?? "note"}
            </button>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
              <span style={{ color:"#666", marginRight:2 }}>REST +</span>
              {COMPOSER_DURATIONS.map(d => (
                <button key={d.beats} onClick={() => advanceCursor(d.beats)}
                  style={{ ...ctrlStyle, color:"#a0a0b0", cursor:"pointer" }}>
                  {d.label}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {!isComposerPlaying
                ? <button onClick={playComposerFromCursor} style={{ ...ctrlStyle, background:"#1a3a1a", color:"#6ee86e", cursor:"pointer" }}>▶ PLAY</button>
                : <button onClick={stopComposerPlayback} style={{ ...ctrlStyle, background:"#3a1a1a", color:"#ff8a8a", cursor:"pointer" }}>■ STOP</button>}
              <button onClick={() => { stopComposerPlayback(); setComposerNotes([]); setComposerCursor(0); composerCursorRef.current = 0; setComposerBracket({startBeat:0,endBeat:4}); setComposerScrollX(0); }} style={{ ...ctrlStyle, cursor:"pointer" }}>CLEAR</button>
              <button onClick={exportComposerMidi} style={{ ...ctrlStyle, cursor:"pointer" }}>⬇ MIDI</button>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:16, alignItems:"center" }}>
              {composerContext?.chord && (
                <span style={{ fontSize:11 }}>
                  <span style={{ color:"#666" }}>ctx: </span>
                  <span style={{ color:"#8ce4ff" }}>{composerContext.chord.symbol}</span>
                  {composerContext.chord.roman && <span style={{ color:"#c8a8ff", marginLeft:4 }}>({composerContext.chord.roman})</span>}
                  {composerContext.nextChords?.length > 0 && <span style={{ color:"#a0f5c4", marginLeft:6 }}>→ {noteNames[composerContext.nextChords[0].rootPc]}{QUALITY_NAMES[composerContext.nextChords[0].quality]??""}</span>}
                </span>
              )}
              <span style={{ color:"#555", fontSize:11 }}>beat {composerCursor % 1 === 0 ? composerCursor : composerCursor.toFixed(2)} · {composerNotes.length} notes</span>
            </div>
          </div>
          <div style={{ width:"100%", padding:"10px 16px", borderTop:"1px solid #1a1a20", background:"#0a0a0d", display:"flex", flexDirection:"column", gap:8, fontFamily:UI_FONT }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:11, color:"#666", letterSpacing:"0.08em" }}>SUGGESTED CHORDS</span>
              <span style={{ display:"flex", alignItems:"center", gap:2, fontSize:11, color:"#555" }}>
                OCT <button onClick={() => setSuggestionOctave(o => o - 1)} style={miniBtn}>−</button>{Math.floor(((composerContext?.avgPitch ?? 60) + suggestionOctave * 12) / 12) - 1}<button onClick={() => setSuggestionOctave(o => o + 1)} style={miniBtn}>+</button>
              </span>
              <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#888", cursor:"pointer", marginLeft:"auto" }}>
                <input type="checkbox" checked={playWholeContext} onChange={(e) => setPlayWholeContext(e.target.checked)} />
                play whole context
              </label>
            </div>
            <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {(composerContext?.allNextChords?.length ?? 0) > 0 ? composerContext.allNextChords.map((nc, i) => (
                <ChordOptionCard key={i} nc={nc} noteNames={noteNames} avgPitch={(composerContext.avgPitch ?? 60) + suggestionOctave * 12}
                  isHovered={hoveredSuggestion?.roman === nc.roman}
                  onHoverStart={() => handleHoverSuggestion(nc)}
                  onHoverEnd={handleLeaveSuggestion}
                  onClick={() => acceptSuggestion(nc, (composerContext.avgPitch ?? 60) + suggestionOctave * 12)} />
              )) : <span style={{ fontSize:11, color:"#555" }}>play a chord to see suggestions here</span>}
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex:1, position:"relative", minHeight:500 }}>
          <canvas ref={improvCanvasRef} style={{ width:"100%", height:"100%", display:"block", position:"absolute", inset:0 }} onMouseDown={handleImprovKeyboardClick} />
          <div style={{ position:"absolute", top:20, left:20, color:"rgba(200,200,255,0.5)", pointerEvents:"none", fontFamily:IMPROV_FONT }}>
            {context.chord ? (
              <>
                <div style={{ fontSize:56, fontWeight:700, letterSpacing:"0.02em", color:"rgba(220,200,255,0.9)", lineHeight:1, textShadow:"0 0 20px rgba(200,150,255,0.5)" }}>{context.chord.symbol}</div>
                {context.chord.roman && <div style={{ color:"rgba(200,150,255,0.75)", marginTop:8, fontSize:24, letterSpacing:"0.08em", fontWeight:400 }}>{context.chord.roman} · {KEY_NAMES[keyRoot]} {mode}</div>}
                {context.nextChords.length > 0 && <div style={{ marginTop:16, fontSize:20, color:"rgba(160,245,196,0.7)", fontWeight:400 }}>→ {buildChordSymbol(context.nextChords[0].rootPc, context.nextChords[0].quality)}</div>}
              </>
            ) : <div style={{ fontSize:32, fontWeight:400, color:"rgba(200,200,255,0.5)" }}>play something</div>}
          </div>
        </div>
      )}

      <div style={{ padding:"8px 20px", borderTop:producerStyle?"1px solid #1a1a20":"1px solid rgba(100,100,200,0.15)", background:producerStyle?"#0b0b0e":"rgba(5,5,20,0.8)", fontSize:11, display:"flex", gap:18, alignItems:"center", color:"#888", flexWrap:"wrap", fontFamily:UI_FONT }}>
        <Legend color={ROLE_COLORS.tonic.light} label="tonic" />
        <Legend color={ROLE_COLORS.chord.light} label="chord tone" />
        <Legend color={ROLE_COLORS.leading.light} label="voice-leading" />
        <Legend color={ROLE_COLORS.tension.light} label="tension" />
        <Legend color={ROLE_COLORS.avoid.light} label="avoid" />
        <div style={{ marginLeft:"auto", fontSize:10, color:"#555" }}>{notes.length} notes · {isRecording ? "RECORDING" : "stopped"}</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<MidiMuse />);
