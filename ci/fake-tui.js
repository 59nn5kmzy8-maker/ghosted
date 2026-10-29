// Stand-in for Claude Code in the warm-pty driver tests: records what is typed until Enter, and whether it ran in a terminal.
const fs = require('fs');
const out = process.argv[2];
let got = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', d => {
  got += d.toString('utf8');
  if (got.includes('\r')) fs.writeFileSync(out, JSON.stringify({ isTTY: !!process.stdin.isTTY, stdoutTTY: !!process.stdout.isTTY, received: got.replace(/\r/g, '') }));
});
process.stdout.write('ready\n');
