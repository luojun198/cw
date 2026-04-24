const fs = require('fs');
const content = fs.readFileSync('client/src/views/report/DynamicReport.vue', 'utf8');

// Extract script section
const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.log('No script section found');
  process.exit(1);
}

const script = scriptMatch[1];
const lines = script.split('\n');

// Simple bracket matching for each line
let braceBalance = 0;
let parenBalance = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  const originalBrace = braceBalance;
  const originalParen = parenBalance;
  
  // Skip comments and strings (simplified)
  const cleanLine = line.replace(/"[^"]*"|'[^']*'/g, '""');
  
  for (let j = 0; j < cleanLine.length; j++) {
    const char = cleanLine[j];
    
    if (char === '{') braceBalance++;
    if (char === '}') braceBalance--;
    if (char === '(') parenBalance++;
    if (char === ')') parenBalance--;
  }
  
  // Show when brace becomes negative
  if (braceBalance < 0) {
    console.log(`Line ${lineNum}: Unexpected '}' (${originalBrace} -> ${braceBalance}): ${line.trim().substring(0, 80)}`);
  }
  if (parenBalance < 0) {
    console.log(`Line ${lineNum}: Unexpected ')' (${originalParen} -> ${parenBalance}): ${line.trim().substring(0, 80)}`);
  }
}

console.log(`\nFinal brace balance: ${braceBalance}`);
console.log(`Final paren balance: ${parenBalance}`);
