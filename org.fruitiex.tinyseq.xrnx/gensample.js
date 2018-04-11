header = require('waveheader');
fs = require('fs');
path = require('path');

//z = `[1,.64,.59,.15,.08].reduce((s,k,i)=>k*Math.sin(i*2*Math.PI*f*t)+s)`;
//filename = 'output.wav';

generateWav = (filename, z) => {
  file = fs.createWriteStream(filename);

  sampleRate = 44100;
  duration = 10;

  samples = [];

  max = -32767;
  min = 32767;
  for (i = 0; i < sampleRate * duration; i++) {
    f = 440;
    t = i / sampleRate;

    sample = eval(z);
    samples.push(sample);

    max = Math.max(max, sample);
    min = Math.min(min, sample);
  }

  // maximize volume
  samples = samples.map(s => (32767 - -32768) * (s - min) / (max - min) + -32768);
  // 16 bit
  samples = samples.map(s => Math.floor(s));
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
  console.log("Done.");
}

generateWav(process.argv[2], process.argv.splice(3).join(' '));
