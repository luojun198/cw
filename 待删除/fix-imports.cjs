const fs = require('fs');
const path = require('path');

const base = '/Users/luojun/projects/cw/server/src';
const files = [
  'index.ts',
  'routes/auth.ts',
  'routes/system.ts',
  'routes/base.ts',
  'routes/voucher.ts',
  'routes/ledger.ts',
  'routes/report.ts',
  'routes/backup.ts',
  'middleware/auth.ts',
  'middleware/log.ts',
  'scripts/initDb.ts',
];

files.forEach(f => {
  const fp = path.join(base, f);
  let content = fs.readFileSync(fp, 'utf-8');
  const original = content;
  // Add .ts to relative imports that don't already have an extension
  content = content.replace(/from '(\.\.?\/[^']+)'/g, (m, importPath) => {
    if (importPath.endsWith('.ts') || importPath.endsWith('.js') || importPath.endsWith('.json')) {
      return m;
    }
    return "from '" + importPath + ".ts'";
  });
  if (content !== original) {
    fs.writeFileSync(fp, content);
    console.log('Fixed:', fp);
  } else {
    console.log('No change:', fp);
  }
});
console.log('Done');
