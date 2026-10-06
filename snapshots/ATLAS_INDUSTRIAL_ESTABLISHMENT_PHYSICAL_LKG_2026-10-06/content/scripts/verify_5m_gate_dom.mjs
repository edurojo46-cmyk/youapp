import http from 'http';
import fs from 'fs';
import WebSocket from 'ws';

function getTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const tabs = await getTabs();
  const personTabs = tabs.filter(t => t.url && t.url.includes('/admin/atlas/persons'));
  const targetTab = personTabs[0] || tabs.find(t => t.url && t.url.includes('5173'));
  if (!targetTab) {
    console.log('No 5173 tab found!');
    return;
  }

  const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  let idCounter = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = idCounter++;
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Reload page to pick up code change in AtlasLiveTelemetryPanel.tsx
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 3500));

  const domCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const peopleEl = document.querySelector('#atlas-live-verified-people-count');
        const attrEl = document.querySelector('#atlas-live-estimated-attributes-count');
        const bodyText = document.body.innerText;
        return {
          peopleText: peopleEl ? peopleEl.innerText : null,
          attrText: attrEl ? attrEl.innerText : null,
          hasAtributosEstimados: bodyText.includes('Atributos estimados'),
          hasDerivado: bodyText.includes('promedio/persona')
        };
      })()
    `,
    returnByValue: true
  });

  console.log('DOM CHECK AFTER RELOAD:', domCheck.result.value);

  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(screenshotRes.data, 'base64');
  const screenshotPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\7c0dabc2-7e61-4a17-a778-4355715ded69\\atlas_people_5m_gate_dom.png';
  fs.writeFileSync(screenshotPath, buffer);
  console.log('Saved screenshot to:', screenshotPath);

  ws.close();
}

main().catch(console.error);
