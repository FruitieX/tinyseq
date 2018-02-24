# tinyseq
A tiny Web Audio API OscillatorNode -based music sequencer.

Mostly useful for size limited demoscene productions.

## sample usage
Take a look in example-player.html

## export renoise song to tinyseq format
A small subset of Renoise functionality can be used, with limitations:

- Patterns (every pattern must have equal line length)
- AHDSR volume envelopes (hold not supported, set it to 0 in Renoise to match tinyseq)
- Delay effect (only single channel support in tinyseq, set identical values to both L/R channels)
- (TODO) Instrument waveform from name
- (TODO) ADSR filter envelopes
- (TODO) Custom waveforms with fourier coefficients, using a Renoise plugin?

Use the following tool to do the conversion:

```
node bin/xrns2ts.js example-song.xrns example-song.js
```

If you use webpack, you might also check out:
https://github.com/FruitieX/tinyseq-xrns-loader
