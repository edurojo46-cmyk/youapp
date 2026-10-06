import fetch from 'node-fetch';

async function testBopba() {
  try {
    const res = await fetch('https://boletinoficial.gba.gob.ar/', { timeout: 6000 });
    console.log('BOPBA raw status:', res.status);
  } catch (e) {
    console.log('BOPBA raw error:', e.message);
  }
}

testBopba();
