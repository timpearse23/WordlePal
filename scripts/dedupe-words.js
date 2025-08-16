const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'words5.json');
try {
  const raw = fs.readFileSync(p, 'utf8');
  const arr = JSON.parse(raw);
  const seen = new Set();
  const dedup = [];
  for (const w of arr) {
    if (!w) continue;
    const lw = String(w).toLowerCase();
    if (!seen.has(lw)) {
      seen.add(lw);
      dedup.push(lw);
    }
  }
  fs.writeFileSync(p, JSON.stringify(dedup, null, 2) + '\n', 'utf8');
  console.log('Deduped words written to', p);
  console.log('Original count:', arr.length);
  console.log('Deduplicated count:', dedup.length);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
