async function testDownload() {
  const url = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/9c65b272-bd29-4743-b91a-18d32e846641/download/igj-2017-semestre-1.zip';
  console.log(`Testing HEAD/GET on IGJ dataset: ${url}`);
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log('Status:', res.status, res.statusText);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'), 'bytes');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testDownload().catch(console.error);
