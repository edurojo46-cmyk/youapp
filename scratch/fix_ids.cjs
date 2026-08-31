const fs = require('fs');
let content = fs.readFileSync('src/lib/youtubeChannelSearch.ts', 'utf8');

// First restore everything to aqz
content = content.replace(/videoseries/g, 'aqz-KE-bpKQ');

// Fix playlist fallback
content = content.replace(/aqz-KE-bpKQ\?list=UU/g, 'videoseries?list=UU');

// Now, carefully replace aqz-KE-bpKQ inside the specific sections:
// Los Redondos -> xq1h4X4I7vw
// Soda Stereo -> T_FkEw27XJ0
// Fito Paez -> T_FkEw27XJ0 (just use Soda's ID or any valid ID, I don't care)

// Split the file roughly by sections or just do simple replacements.
// Since these are mock objects, let's just do a string replacement on the exact blocks
function replaceInBlock(startMarker, endMarker, newId) {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) return;
    let endIndex = content.indexOf(endMarker, startIndex);
    if (endIndex === -1) endIndex = content.length;
    
    const before = content.slice(0, startIndex);
    const middle = content.slice(startIndex, endIndex).replace(/aqz-KE-bpKQ/g, newId);
    const after = content.slice(endIndex);
    content = before + middle + after;
}

replaceInBlock("keywords: ['los redondos'", "keywords: ['soda stereo'", 'xq1h4X4I7vw');
replaceInBlock("keywords: ['soda stereo'", "keywords: ['fito paez'", 'T_FkEw27XJ0');
replaceInBlock("keywords: ['fito paez'", "export async function fetchYouTubeViaCorsProxy", 'T_FkEw27XJ0');

fs.writeFileSync('src/lib/youtubeChannelSearch.ts', content);
console.log('Done!');
