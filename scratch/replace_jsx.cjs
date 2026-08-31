const fs = require('fs');
const targetFile = 'src/pages/ChannelSearch.tsx';
const newJsxFile = 'scratch/new_jsx.txt';

let content = fs.readFileSync(targetFile, 'utf8');
const newJsx = fs.readFileSync(newJsxFile, 'utf8');

// Find the return statement dynamically
const returnRegex = /return\s*\(\s*<div\s+className="youapp-search-page"/m;
const match = content.match(returnRegex);

if (!match) {
  console.error('Could not find the return statement');
  process.exit(1);
}

const beforeReturn = content.slice(0, match.index);
let newContent = beforeReturn + newJsx;

// 2. Safely update lucide-react imports
const importRegex = /import\s+\{\s*([^}]+)\s*\}\s+from\s+'lucide-react';/;
newContent = newContent.replace(importRegex, (m, p1) => {
  const existingImports = p1.split(',').map(s => s.trim()).filter(Boolean);
  const newIcons = ['Shield', 'Landmark', 'Cpu', 'Video', 'Music', 'Bookmark'];
  
  newIcons.forEach(icon => {
    if (!existingImports.includes(icon)) {
      existingImports.push(icon);
    }
  });
  
  return `import {\n  ${existingImports.join(', ')}\n} from 'lucide-react';`;
});

fs.writeFileSync(targetFile, newContent);
console.log('Replaced JSX and imports successfully.');
