function render() {
  if (!micActive && !fileAudioActive) simulateAudio();
  else if (analyser) analyser.getByteFrequencyData(audioData);

  processAudio();
  const b = bands();
  drawBackground(b);

  ctx.save();
  switch (mode) {
    case 'particles': drawParticles(b); break;
    case 'waveform':  drawWaveform(b);  break;
    case 'geometry':  drawGeometry(b);  break;
    case 'tunnel':    drawTunnel(b);    break;
    case 'lissajous': drawLissajous(b); break;
    case 'bars':      drawBars(b);      break;
  }
  ctx.restore();

  updateFreqBar(b);
  t++;
  requestAnimationFrame(render);
}

render();
