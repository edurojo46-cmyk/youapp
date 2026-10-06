async function run() {
  const h2 = await (await fetch('http://www.ffyb.uba.ar/institucional/autoridades/')).text();
  const clean2 = h2.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const lines2 = clean2.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(s => s.length > 2);
  console.log('FFyB lines 200-290:');
  for (let i = 200; i < lines2.length; i++) {
    console.log(`[${i}] ${lines2[i]}`);
  }
}
run();
