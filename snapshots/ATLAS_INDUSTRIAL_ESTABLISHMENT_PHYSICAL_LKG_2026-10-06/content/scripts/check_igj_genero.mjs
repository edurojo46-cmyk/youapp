async function checkIgjGenero() {
  const url = 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv';
  console.log('Checking HEAD for:', url);
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log('Status:', res.status, res.statusText);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'), 'bytes');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkIgjGenero().catch(console.error);
