const xlsx = require('xlsx');
const wb = xlsx.readFile('模版/资产表.XLS', {cellStyles: true});
const sheet = wb.Sheets[wb.SheetNames[0]];

// Build cell map and find data
const cellMap = new Map();
const rowDataCols = new Map();
let maxDataR = 0, maxDataC = 0;

for (const key of Object.keys(sheet)) {
  if (key.startsWith('!')) continue;
  const rawCell = sheet[key];
  const addr = xlsx.utils.decode_cell(key);
  cellMap.set(addr.r + ':' + addr.c, rawCell);
  if (rawCell && rawCell.v != null && String(rawCell.v).trim() !== '') {
    maxDataR = Math.max(maxDataR, addr.r);
    maxDataC = Math.max(maxDataC, addr.c);
    if (!rowDataCols.has(addr.r)) rowDataCols.set(addr.r, new Set());
    rowDataCols.get(addr.r).add(addr.c);
  }
}

console.log('maxDataR:', maxDataR, 'maxDataC:', maxDataC);

// Test the merge inference logic
const mergeMap = new Map();
const visited = new Set();

for (let r = 0; r <= maxDataR; r++) {
  const colsInRow = rowDataCols.get(r);
  if (!colsInRow || colsInRow.size === 0) continue;

  const sortedCols = Array.from(colsInRow).sort((a, b) => a - b);
  const firstCol = sortedCols[0];
  const lastCol = sortedCols[sortedCols.length - 1];

  // Find effective maxC from rows below
  let effectiveMaxC = maxDataC;
  for (let checkR = r + 1; checkR <= maxDataR; checkR++) {
    const checkCols = rowDataCols.get(checkR);
    if (checkCols && checkCols.size > 0) {
      effectiveMaxC = Math.max(...Array.from(checkCols));
      break;
    }
  }

  console.log('Row', r, ':', sortedCols.length, 'cells, firstCol:', firstCol, 'lastCol:', lastCol, 'effectiveMaxC:', effectiveMaxC);

  // Heuristic 1: single cell at left edge -> merge right
  if (sortedCols.length === 1 && firstCol === 0) {
    const endC = effectiveMaxC;
    if (endC > firstCol) {
      mergeMap.set(r + ':' + firstCol, { colSpan: endC - firstCol + 1, rowSpan: 1 });
      console.log('  -> Merge right: A' + (r+1) + ':' + xlsx.utils.encode_cell({r, c: endC}));
      continue;
    }
  }

  // Heuristic 2: single cell at right edge -> merge left
  if (sortedCols.length === 1 && lastCol === effectiveMaxC && firstCol > 0) {
    const startC = 0;
    mergeMap.set(r + ':' + startC, { colSpan: lastCol - startC + 1, rowSpan: 1 });
    console.log('  -> Merge left: ' + xlsx.utils.encode_cell({r, c: startC}) + ':' + xlsx.utils.encode_cell({r, c: lastCol}));
    continue;
  }

  // Mark all data cells as visited
  for (const c of sortedCols) visited.add(r + ':' + c);
}

console.log('\nTotal merges inferred:', mergeMap.size);
for (const [key, m] of mergeMap) {
  const [r, c] = key.split(':').map(Number);
  console.log(' ', xlsx.utils.encode_cell({r, c}), '-> colSpan:', m.colSpan, 'rowSpan:', m.rowSpan);
}
