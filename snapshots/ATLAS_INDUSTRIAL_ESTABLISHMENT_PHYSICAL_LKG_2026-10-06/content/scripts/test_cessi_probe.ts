import dotenv from 'dotenv';
dotenv.config();
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspectCessiHtml() {
  const res = await fetch('https://cessi.org.ar/comision-directiva/', {
    agent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  } as any);
  const html = await res.text();
  console.log(html.substring(0, 1500));
}

inspectCessiHtml().catch(console.error);
