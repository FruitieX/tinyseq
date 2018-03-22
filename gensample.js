header = require('waveheader');
fs = require('fs');

z = `[1,.64,.59,.15,.08].reduce((s,k,i)=>k*Math.sin(i*2*Math.PI*f*t)+s)`;

generateWav = z => {
  file = fs.createWriteStream('output.wav');

  sampleRate = 44100;
  duration = 10;

  samples = [];

  max = 0;
  for (i = 0; i < sampleRate * duration; i++) {
    f = 440;
    t = i / sampleRate;

    sample = eval(z);
    samples.push(sample);

    max = Math.max(max, Math.abs(sample));
  }

  // normalize
  samples = samples.map(s => s / max);
  // 16 bit
  samples = samples.map(s => Math.round(s * 32767));
  data = Int16Array.from(samples);

  file.write(header(samples.length * 2, {
    sampleRate,
    channels: 1,
    bitDepth: 16
  }));

  buffer = new Buffer(data.length * 2);

  data.forEach((s, i) => buffer.writeInt16LE(s, i * 2));

  file.write(buffer);
  file.end();
}

generateWav(z);
