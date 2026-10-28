// Records raw console input to a file, like Claude Code's input box would receive it.
const fs = require('fs');
const out = process.argv[2];
let got = '';
process.stdin.setRawMode(true);
process.stdin.on('data', d => {
  got += d.toString('utf8');
  fs.writeFileSync(out, JSON.stringify(got));
  if ((got.match(/\r/g) || []).length >= 2) process.exit(0);
});
setTimeout(() => process.exit(1), 60000);
