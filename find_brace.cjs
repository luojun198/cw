const fs = require('fs');
const c = fs.readFileSync('client/src/views/report/DynamicReport.vue', 'utf8');
const m = c.match(/<script[^>]*>([\s\S]*)<\/script>/);
if (m) {
  const s = m[1];
  const lines = s.split('\n');
  let b = 0;
  let started = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') b++;
      if (ch === '}') b--;
    }
    // Track when balance increases without proper close
    if (b > 1 && !started) {
      started = true;
      console.log('First unclosed brace appears at line ' + (i + 1));
      console.log('Line: ' + line.substring(0, 100));
    }
  }
  console.log('Final brace balance: ' + b);
}
