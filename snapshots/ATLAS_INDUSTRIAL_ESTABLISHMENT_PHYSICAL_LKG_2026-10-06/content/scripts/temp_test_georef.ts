import fetch from 'node-fetch';

async function testGeoref() {
  console.log('--- Testing Georef Argentina API ---');
  
  // 1. Test Address Normalization in CABA
  const addressQuery = 'Av. Córdoba 2122';
  const url1 = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(addressQuery)}&provincia=02&max=3`;
  console.log('Calling:', url1);
  const res1 = await fetch(url1);
  const json1: any = await res1.json();
  console.log('Address result:', JSON.stringify(json1.direcciones?.[0], null, 2));

  // 2. Test Reverse Geocoding / Departments (Comunas)
  const lat = -34.6000;
  const lon = -58.3980;
  const url2 = `https://apis.datos.gob.ar/georef/api/ubicacion?lat=${lat}&lon=${lon}`;
  console.log('\nCalling:', url2);
  const res2 = await fetch(url2);
  const json2: any = await res2.json();
  console.log('Location result:', JSON.stringify(json2.ubicacion, null, 2));
}

testGeoref();
