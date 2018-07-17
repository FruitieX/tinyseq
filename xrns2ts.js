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

const JsonToTinyseq = (json, instruments) => {
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

        // Transpose
        instrument.N = 48 - Number(renoiseInstrument.SampleGenerator.Samples.Sample.Transpose);

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

        instrument.w = instruments[renoiseInstrument.Name];
        /*
        const samples = renoiseInstrument.SampleGenerator.Samples.Sample;
        forEachMaybeArray(samples, (sample) => {
          const name = sample.Name;
          if (name.slice(0, 12) === 'tinyseq func') {
            instrument.w = name.slice(13);
          }
        });
        */
      }

      if (!instrument[patternIndex].length) {
        delete instrument[patternIndex];
      }

      if (instrument[patternIndex]) {
        s.i[trackIndex] = { ...s.i[trackIndex], ...instrument };
      }
    });
  });

  // Do some optimisations
  s.i = s.i.map(instrument => {
    let lowestNote = 999;

    Object.values(instrument).filter(Array.isArray).forEach(pattern => {
      pattern.forEach(note => {
        if (note > 0 && note < lowestNote) {
          lowestNote = note;
        }
      });
    });

    // Now that we know the lowestNote, subtract all other notes (> 0) by lowestNote - 1
    Object.entries(instrument).filter(([key, value]) => Array.isArray(value)).forEach(([index, pattern]) => {
      pattern.forEach((note, index) => {
        if (note > 0) {
          pattern[index] -= lowestNote - 1;
        }
      });
    })

    // And add to instrument transpose to correct for this
    instrument.N -= lowestNote - 1;

    // Returns true if patterns are equal
    const comparePatterns = (a, b) => {
      if (a.length !== b.length) return false;

      for (i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }

      // Otherwise patterns are equal
      return true;
    };

    // Find index of first identical pattern that is below this one
    const findMatchingPattern = (instrument, pattern, index) => {
      let foundIndex = -1;

      Object.entries(instrument)
        .filter(([testIndex, value]) => Array.isArray(value))
        .filter(([testIndex, value]) => Number(testIndex) < Number(index))
        .forEach(([testIndex, testPattern]) => {
          // Only test if we didn't already find a match
          if (foundIndex === -1) {
            if (comparePatterns(pattern, testPattern)) {
              foundIndex = testIndex;
            }
          }
        });

      return foundIndex;
    };

    // Try finding patterns that repeat and replace those with an index reference
    Object.entries(instrument).filter(([key, value]) => Array.isArray(value)).forEach(([index, pattern]) => {
      const foundIndex = findMatchingPattern(instrument, pattern, index);

      if (foundIndex !== -1) {
        instrument[index] = foundIndex;
      }
    })

    return instrument;
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
module.exports = (xrns, instruments, callback) => {
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
            const tinySeqSong = JsonToTinyseq(json, instruments);
            callback(tinySeqSong);
          });
        });
      } else {
        entry.autodrain();
      }
    });
};
