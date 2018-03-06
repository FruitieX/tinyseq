const unzip = require('unzip');
const xml2js = require('xml2js');
const stringifyObject = require('stringify-object');

const noteRegex = /([A-Z#]+)-?(\d)/;
const noteToNumber = noteString => {
  if (noteString === 'OFF') return -1;

  const [_, note, octave] = noteString.match(noteRegex);

  let offs = 0;
  switch (note) {
    case 'C':  offs = 0; break;
    case 'C#': offs = 1; break;
    case 'D':  offs = 2; break;
    case 'D#': offs = 3; break;
    case 'E':  offs = 4; break;
    case 'F':  offs = 5; break;
    case 'F#': offs = 6; break;
    case 'G':  offs = 7; break;
    case 'G#': offs = 8; break;
    case 'A':  offs = 9; break;
    case 'A#': offs = 10; break;
    case 'B':  offs = 11; break;
  }

  return octave * 12 + offs;
}

// This XML conversion crap emits arrays only when there are multiple child elements blah,
// so emulate a forEach even on non-array elements...
const forEachMaybeArray = (a, f) => {
  if (Array.isArray(a)) {
    a.forEach(f);
  } else {
    // Call function as if forEach called it on the first element in an array [a]
    f(a, 0, [a]);
  }
}

// yeah, dunnolol
// result of a curve fit and lots of trial and error
const renoiseAHDSRScale = x => {
  const approx = -1.05695e-10 + 2.289697e-8*x - 6.025678e-8*x ** 2 + 60*x ** 3;
  return Math.round(approx * 1000) / 1000;
}

const arrIsLooped = (arr) => {
  for (let trySize = 1; trySize <= arr.length / 2; trySize++) {
    const tryPattern = arr.slice(0, trySize);

    // Assume it does loop and try proving otherwise
    let doesLoop = true;

    // Split arr into chunks of trySize and make sure each chunk equals tryPattern
    let offs = 0;
    while (offs < arr.length) {
      const chunk = arr.slice(offs, offs + trySize);

      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] !== tryPattern[i]) {
          doesLoop = false;
          break;
        }
      }

      if (!doesLoop) break;

      offs += trySize;
    }

    // Loop was found with size trySize
    if (doesLoop) {
      return trySize;
    }
  }

  // No loop was found
  return 0;
}

const SongXmlToJson = (xml, callback) => {
  var parser = new xml2js.Parser({ explicitArray: false });
  parser.parseString(xml, (err, result) => {
    callback(result);
  });
};

const JsonToTinyseq = json => {
  const song = json.RenoiseSong;

  const songData = song.GlobalSongData;
  const bpm = songData.BeatsPerMin;
  const lpb = songData.LinesPerBeat;

  const s = {i: [], p: []};

  s.b = (60 / bpm) / lpb;

  // Store pattern sequence in s.p
  const patternSequences = song.PatternSequence.SequenceEntries.SequenceEntry;
  forEachMaybeArray(patternSequences, (patternSequence, sequenceIndex) => {
    s.p[sequenceIndex] = Number(patternSequence.Pattern);
  });

  const patterns = song.PatternPool.Patterns.Pattern;

  // For each pattern
  forEachMaybeArray(patterns, (pattern, patternIndex) => {
    // rows per loop, must be constant in all patterns
    s.r = Number(pattern.NumberOfLines);

    const tracks = pattern.Tracks.PatternTrack;

    // For each track
    forEachMaybeArray(tracks, (track, trackIndex) => {
      // Defaults
      const instrument = {
        [patternIndex]: [],
        a: 0,
        d: 0,
        s: 1,
        r: 0
      };
      let instrumentId = 0;

      instrument.N = 81; // TODO

      const sequencerTrack = song.Tracks.SequencerTrack[trackIndex];

      // Ignore empty tracks
      if (track.Lines && sequencerTrack.State !== 'Off') {
        const lines = track.Lines.Line;

        // For each line in track
        forEachMaybeArray(lines, (line) => {
          const lineIndex = line.$.index;
          instrument[patternIndex][lineIndex] = noteToNumber(line.NoteColumns.NoteColumn.Note);

          const MaybeInstrumentId = Number(line.NoteColumns.NoteColumn.Instrument);
          if (!isNaN(MaybeInstrumentId))
            instrumentId = MaybeInstrumentId;
        });

        const renoiseInstrument = song.Instruments.Instrument[instrumentId];

        // Try finding AHDSR modulator
        const modulationDevices = renoiseInstrument.SampleGenerator.ModulationSets.ModulationSet.Devices;

        const mixerDevice = modulationDevices.SampleMixerModulationDevice;

        instrument.v = Number(mixerDevice.Volume.Value)
        // TODO: this is always zero?
        //instrument.V = 0;

        instrument.f = Number(mixerDevice.Cutoff.Value) / 100 * 20
        // TODO: this is always zero?
        //instrument.F = 0;

        const AHDSR = modulationDevices.SampleAhdsrModulationDevice;

        if (AHDSR) {
          // For each AHDSR modulation device
          forEachMaybeArray(AHDSR, AHDSRDevice => {
            if (AHDSRDevice.Target === 'Volume') {
              instrument.a = renoiseAHDSRScale(Number(AHDSRDevice.Attack.Value));
              instrument.d = renoiseAHDSRScale(Number(AHDSRDevice.Decay.Value));
              instrument.s = instrument.v * Number(AHDSRDevice.Sustain.Value);
              instrument.r = renoiseAHDSRScale(Number(AHDSRDevice.Release.Value));
            } else if (AHDSRDevice.Target === 'Cutoff') {
              //instrument.f = Number(AHDSRDevice.Attack.Value)
              //instrument.F = Number(AHDSRDevice.Attack.Value)
            }
          });
        }

        const DelayDevice = sequencerTrack.FilterDevices.Devices.DelayDevice;

        if (DelayDevice && DelayDevice.IsActive.Value === '1.0') {
          instrument.e = Number(DelayDevice.LDelay.Value) / 1000;
          instrument.E = Number(DelayDevice.LFeedback.Value);
        }

        // fill in empty notes with zeroes
        for (let i = 0; i < s.r; i++) {
          if (!instrument[patternIndex][i]) {
            instrument[patternIndex][i] = undefined;
          }
        }

        // Try finding repeating pattern in note sequence
        // If found, we can discard the repeating sections as
        // tinyseq will loop these automatically
        const loopSize = arrIsLooped(instrument[patternIndex]);
        if (loopSize) {
          instrument[patternIndex] = instrument[patternIndex].slice(0, loopSize);
        }

        const samples = renoiseInstrument.SampleGenerator.Samples.Sample;
        forEachMaybeArray(samples, (sample) => {
          const name = sample.Name;
          if (name.slice(0, 18) === 'tinyseq Parameters') {
            const firstClosingIndex = name.indexOf('}');
            const lastOpeningIndex = name.lastIndexOf('{');

            const params = name.slice(lastOpeningIndex + 1, firstClosingIndex - 2);
            let arr = JSON.parse(`[${params}]`);

            arr = arr.map(e => Math.round(e * 10) / 10);

            let lastNonZero = 0;
            arr.forEach((e, i) => {
              if (e) {
                lastNonZero = i;
              }
            });
            arr = arr.slice(0, lastNonZero + 1);

            instrument.w = arr;
          }
        });
      }

      if (!instrument[patternIndex].length) {
        delete instrument[patternIndex];
      }

      if (instrument[patternIndex]) {
        s.i[trackIndex] = { ...s.i[trackIndex], ...instrument };
      }
    });
  });

  let stringified = stringifyObject(s, { indent: '  ' });

  // get rid of undefineds in the note arrays
  stringified = stringified.replace(/undefined,/g, ',');
  stringified = stringified.replace(/undefined/g, ',');

  //writeFileSync(process.argv[3], `module.exports = ${stringified};`);

  //console.log(`wrote ${process.argv[3]}`);
  //process.exit(0);

  return stringified;
};

// Unzip given xrns file (file contents as string), callback with tinyseq song.
module.exports = (xrns, callback) => {
  var Readable = require('stream').Readable;
  const stream = new Readable();
  //s._read = function noop() {};
  stream.push(xrns);
  stream.push(null);

  stream
    .pipe(unzip.Parse())
    .on('entry', entry => {
      if (entry.path === 'Song.xml') {
        let file = '';

        entry.on('data', chunk => {
          file += chunk;
        });
        entry.on('end', () => {
          SongXmlToJson(file, json => {
            const tinySeqSong = JsonToTinyseq(json);
            callback(tinySeqSong);
          });
        });
      } else {
        entry.autodrain();
      }
    });
};
