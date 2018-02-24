const { xrns2ts } = require('../');
const { writeFileSync, readFileSync } = require('fs');

if (!process.argv[2]) {
  console.error('First argument must be path to input (xrns) file!');
  process.exit(1);
}

const xrns = readFileSync(process.argv[2]);

if (!process.argv[3]) {
  console.error('Second argument must be path to output (js) file!');
  process.exit(1);
}

xrns2ts(xrns, ts => {
  writeFileSync(process.argv[3], `s=${ts}`);
  console.log(`wrote ${process.argv[3]}.`);
});
