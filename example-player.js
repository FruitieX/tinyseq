// repeat function
r = (c, f) => [...Array(c).keys()].map(f);

A = new AudioContext;

I = s.i.map(i => {
  o = A.createOscillator();
  e = A.createGain();
  l = A.createBiquadFilter();
  d = A.createDelay();
  f = A.createGain();

  // Set oscillator type
  i.t && (o.type = i.t);

  // Start oscillator
  o.start();

  // Oscillators start out silent, TODO: unnecessary?
  e.gain.setValueAtTime(0, 0);

  // echo
  f.gain.setValueAtTime(i.E || 0, 0);
  d.delayTime.setValueAtTime(i.e || .3, 0);

  // Set filter Q value
  //l.Q.value = 12;

  i.T && (l.type = i.T);

  // Connect oscillator to envelope
  o.connect(e);

  // Connect envelope to filter
  e.connect(l);

  // connect to (slapback) delay if key exists
  l.connect(f);

  // connect delay to feedback and back so it echoes out
  f.connect(d);
  d.connect(f);

  // finally, connect delay to filter
  a = A.destination;
  d.connect(a);

  // Connect filter to master
  l.connect(a);

  return { ...i, o, e, l };
});

// Program notes
s.p.map((p, l) => // patterns
  r(s.r, r => // rows
    I.map(i => { // for each instrument
      // Given pattern does not exist for this instrument, skip
      if (!i[p]) return;

      // Note index
      //n = r % i[p].length;

      // Current note
      N = i[p][r % i[p].length];

      // TODO: arpeggio support?
      /*
      N = i.A
        // Arpeggio, ~~ does Math.floor()
        ? i[p][~~n][((r % i.r) * i.A) % i[p][~~n].length]
        // Normal notes
        : i[p][n];
        */

      // Empty note or zero means hold previous note
      if (!N) return;

      // Start time
      t = (
        l * s.r + // Loop index * rows per loop
        r         // Row index
      ) * s.b;    // * Seconds per row

      // ADSR envelope helper function
      a = (param, from, to, time) => {
        // First cancel any scheduled value changes
        //i.e.gain.cancelScheduledValues(t)
        param.cancelAndHoldAtTime(t);

        // Value starts at from value
        param.setValueAtTime(from, t);

        // Fade toward to value if time parameter was given
        time && param.linearRampToValueAtTime(to, t += time);
      };

      // Off note, release previous note
      if (N < 0)
        return a(i.e.gain, i.v * i.s, 0, i.r);

      // Instantly set new frequency
      a(i.o.frequency, 440 * Math.pow(2, (N - i.N) / 12));

      // Attack
      a(i.e.gain, 0, i.v, i.a);

      // Decay
      // TODO: maybe store i.v * i.s directly in song.js?
      a(i.e.gain, i.v, i.s, i.d);

      // Sustain
      a(i.e.gain, i.s);
    })
  )
);
