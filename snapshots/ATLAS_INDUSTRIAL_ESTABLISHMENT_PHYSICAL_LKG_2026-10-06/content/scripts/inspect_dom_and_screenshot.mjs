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
  console.log('Found person tabs:', personTabs.map(t => ({ id: t.id, url: t.url, title: t.title })));

  const targetTab = personTabs[0] || tabs.find(t => t.url && t.url.includes('5173'));
  if (!targetTab) {
    console.log('No 5173 tab found!');
    return;
  }

  console.log('Connecting to tab:', targetTab.title, targetTab.webSocketDebuggerUrl);
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

  // Evaluate DOM to see what's on screen
  const domResult = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.querySelector('#atlas-live-verified-people-count');
        const badge = document.querySelector('#atlas-live-badge');
        const allText = document.body.innerText;
        return {
          counterText: el ? el.innerText : null,
          badgeText: badge ? badge.innerText : null,
          has2M: allText.includes('2.000.025') || allText.includes('2,000,025') || allText.includes('2.000.000'),
          snippet: allText.slice(0, 500)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('DOM RESULT:', domResult.result.value);

  // If needed, reload or trigger event so SSE / query refreshes UI
  if (!domResult.result.value.counterText || !domResult.result.value.counterText.includes('2.000.025')) {
    console.log('Reloading target tab to pick up latest PostgreSQL SSOT state...');
    await send('Page.reload');
    await new Promise(r => setTimeout(r, 2000));

    const domAfterReload = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.querySelector('#atlas-live-verified-people-count');
          const badge = document.querySelector('#atlas-live-badge');
          return {
            counterText: el ? el.innerText : null,
            badgeText: badge ? badge.innerText : null
          };
        })()
      `,
      returnByValue: true
    });
    console.log('DOM AFTER RELOAD:', domAfterReload.result.value);
  }

  // Take screenshot
  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(screenshotRes.data, 'base64');
  const screenshotPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\7c0dabc2-7e61-4a17-a778-4355715ded69\\atlas_people_2m_certified_dom.png';
  fs.writeFileSync(screenshotPath, buffer);
  console.log('Saved screenshot to:', screenshotPath);

  ws.close();
}

main().catch(console.error);
