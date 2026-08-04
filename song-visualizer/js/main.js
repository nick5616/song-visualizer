import { state, ctx } from "./state.js";
import { simulateAudio, processAudio, bands } from "./audio.js";
import {
    drawParticles,
    drawWaveform,
    drawGeometry,
    drawTunnel,
    drawLissajous,
    drawBars,
    drawRadial,
    drawHelix,
    drawStarfield,
    drawTerrain,
    drawAurora,
    drawKaleidoscope,
    drawRipples,
    drawVortex,
    drawGuitarHero,
    drawGuitarHeroReverse,
    drawBackground,
    updateFreqBar,
} from "./visualizers.js";
import { advanceCycleMode } from "./controls.js";

function render() {
    if (!state.micActive && !state.fileAudioActive) simulateAudio();
    else if (state.analyser) state.analyser.getByteFrequencyData(state.audioData);

    processAudio();
    const b = bands();

    if (state.cycleEnabled && state.selectedModes.length > 1) {
        if (++state.cycleFrameCount >= state.cycleInterval * 60) {
            state.cycleFrameCount = 0;
            advanceCycleMode();
        }
    }

    if (state.beatSwitchEnabled && state.selectedModes.length > 1) {
        if (state.beatCooldownFrames > 0) state.beatCooldownFrames--;
        if (b.bass > 0.7 && state.lastBassLevel <= 0.7 && state.beatCooldownFrames === 0) {
            advanceCycleMode();
            state.beatCooldownFrames = 45;
        }
        state.lastBassLevel = b.bass;
    }

    drawBackground(b);

    ctx.save();
    switch (state.mode) {
        case 'particles':     drawParticles(b);     break;
        case 'waveform':      drawWaveform(b);      break;
        case 'geometry':      drawGeometry(b);      break;
        case 'tunnel':        drawTunnel(b);        break;
        case 'lissajous':     drawLissajous(b);     break;
        case 'bars':          drawBars(b);          break;
        case 'radial':        drawRadial(b);        break;
        case 'helix':         drawHelix(b);         break;
        case 'starfield':     drawStarfield(b);     break;
        case 'terrain':       drawTerrain(b);       break;
        case 'aurora':        drawAurora(b);        break;
        case 'kaleidoscope':  drawKaleidoscope(b);  break;
        case 'ripples':       drawRipples(b);       break;
        case 'vortex':        drawVortex(b);        break;
        case 'guitarhero':    drawGuitarHero(b);        break;
        case 'ghreverse':     drawGuitarHeroReverse(b); break;
    }
    ctx.restore();

    updateFreqBar(b);
    state.t++;
    requestAnimationFrame(render);
}

render();
