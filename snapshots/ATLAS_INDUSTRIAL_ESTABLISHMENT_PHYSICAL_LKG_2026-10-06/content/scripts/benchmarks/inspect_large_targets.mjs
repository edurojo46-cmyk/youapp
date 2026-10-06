import fs from 'node:fs';
import path from 'node:path';

function inspectDir(dir, label) {
  console.log(`\n=== ${label} (${dir}) ===`);
  if (!fs.existsSync(dir)) {
    console.log('Does not exist.');
    return;
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = [];
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      try {
        const stat = fs.statSync(full);
        if (ent.isDirectory()) {
          let count = 0;
          let subSize = 0;
          try {
            for (const f of fs.readdirSync(full)) {
              count++;
              try { subSize += fs.statSync(path.join(full, f)).size; } catch {}
            }
          } catch {}
          items.push({ name: ent.name, type: 'dir', sizeMB: (subSize / (1024 * 1024)).toFixed(2), count });
        } else {
          items.push({ name: ent.name, type: 'file', sizeMB: (stat.size / (1024 * 1024)).toFixed(2) });
        }
      } catch {}
    }
    items.sort((a, b) => parseFloat(b.sizeMB) - parseFloat(a.sizeMB));
    items.slice(0, 15).forEach(i => console.log(`  ${i.name} [${i.type}]: ${i.sizeMB} MB`));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

inspectDir('C:\\Users\\Eduardo\\.gemini\\antigravity-backup', 'ANTIGRAVITY BACKUP');
inspectDir('C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain', 'IDE BRAIN');
inspectDir('C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\conversations', 'IDE CONVERSATIONS');
inspectDir('C:\\Users\\Eduardo\\Desktop', 'DESKTOP');
inspectDir('C:\\Users\\Eduardo\\Downloads', 'DOWNLOADS');
