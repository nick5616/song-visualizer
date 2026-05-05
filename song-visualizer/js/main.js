function render() {
  if (!micActive && !fileAudioActive) simulateAudio();
  else if (analyser) analyser.getByteFrequencyData(audioData);

  processAudio();
  const b = bands();

  if (cycleEnabled && selectedModes.length > 1) {
    if (++cycleFrameCount >= cycleInterval * 60) {
      cycleFrameCount = 0;
      advanceCycleMode();
    }
  }

  if (beatSwitchEnabled && selectedModes.length > 1) {
    if (beatCooldownFrames > 0) beatCooldownFrames--;
    if (b.bass > 0.7 && lastBassLevel <= 0.7 && beatCooldownFrames === 0) {
      advanceCycleMode();
      beatCooldownFrames = 45;
    }
    lastBassLevel = b.bass;
  }

  drawBackground(b);

  ctx.save();
  switch (mode) {
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
  t++;
  requestAnimationFrame(render);
}

render();
