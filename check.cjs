const fs = require('fs');
const lines = fs.readFileSync('benchmark_results.txt', 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(' WIN')) {
    console.log(lines.slice(Math.max(0, i - 5), i + 1).join('\n'));
    console.log('--------------------');
  }
}
