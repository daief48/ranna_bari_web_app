/*
 * Throwaway: shoot the cook dashboard's shutter card in both states, and
 * check the new button actually flips the server.
 *
 * MSYS_NO_PATHCONV=1 or the /path argument is rewritten to a Windows path.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PHONE = process.argv[2];
const APP = `http://localhost:${process.env.APP_PORT ?? 8082}`;
const API = 'http://localhost:4000/api/app/v1';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = (p, b) => fetch(`${API}${p}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
}).then((r) => r.json());

const ask = await post('/auth/request-otp', { phone: PHONE });
if (!ask.devCode) { console.error('otp:', JSON.stringify(ask)); process.exit(1); }
const session = await post('/auth/verify-otp', { phone: PHONE, code: String(ask.devCode) });
const serverOpen = async () => (await fetch(`${API}/kitchens/mine`, {
  headers: { authorization: `Bearer ${session.token}` },
}).then((r) => r.json())).kitchen?.isOpen;

const port = 9600 + Math.floor(Math.random() * 60);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shut-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80 && !page; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = list.find((t) => t.type === 'page');
  } catch { /* not up */ }
  if (!page) await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = (expression) =>
  send('Runtime.evaluate', { returnByValue: true, expression }).then((r) => r.result?.result?.value);

const shootCard = async (name) => {
  const box = await evaluate(`(() => {
    const hit = [...document.querySelectorAll('div')]
      .filter((d) => /open the kitchen|close the kitchen/i.test(d.innerText || '') && d.getClientRects().length)
      .sort((a, b) => b.innerHTML.length - a.innerHTML.length)
      .filter((d) => d.getBoundingClientRect().height < 320)[0];
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' });
    const r = hit.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.left) - 8), y: Math.max(0, Math.round(r.top) - 8),
             width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
  })()`);
  await sleep(1200);
  const shot = await send('Page.captureScreenshot', {
    format: 'png', ...(box ? { clip: { ...box, scale: 2 } } : {}),
  });
  if (shot.result?.data) { writeFileSync(name, Buffer.from(shot.result.data, 'base64')); console.log(`  ${name}`); }
};

const tapButton = async () => {
  const at = await evaluate(`(() => {
    const b = [...document.querySelectorAll('div,span')]
      .filter((e) => /^(open|close) the kitchen$/i.test((e.innerText || '').trim()) && e.getClientRects().length)
      .sort((a, b2) => a.innerHTML.length - b2.innerHTML.length)[0];
    if (!b) return null;
    let el = b;
    for (let i = 0; i < 5 && el.parentElement; i += 1) {
      if (el.getAttribute('role') === 'button') break;
      el = el.parentElement;
    }
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: b.innerText.trim(), role: el.getAttribute('role') };
  })()`);
  if (!at) { console.log('  no button found'); return false; }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: at.x, y: at.y, button: 'left', clickCount: 1,
      buttons: type === 'mousePressed' ? 1 : 0, pointerType: 'mouse',
    });
    await sleep(90);
  }
  console.log(`  tapped "${at.label}" (role=${at.role})`);
  await sleep(6000);
  return true;
};

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.enable');
await send('Page.navigate', { url: APP });
for (let i = 0; i < 60; i += 1) {
  if (await evaluate('document.body && document.body.innerText.length > 200')) break;
  await sleep(2000);
}
await evaluate(`(() => {
  localStorage.setItem('rannabari_token', ${JSON.stringify(session.token)});
  localStorage.setItem('rannabari_identity', ${JSON.stringify(JSON.stringify(session.account))});
  localStorage.setItem('rannabari_account', ${JSON.stringify(JSON.stringify({
    role: 'cook', name: session.account.name, phone: session.account.phone,
    accountId: session.account.accountId, kitchenId: session.account.kitchenId,
    kitchen: session.account.kitchenName, signedInAt: new Date().toISOString(),
  }))});
  localStorage.setItem('rannabari_viewmode', 'cook');
})()`);
await send('Page.navigate', { url: `${APP}/cook` });
await sleep(22000);

console.log(`server isOpen = ${await serverOpen()}`);
await shootCard('shutter-a.png');
console.log('tapping the button...');
await tapButton();
console.log(`server isOpen = ${await serverOpen()}`);
await shootCard('shutter-b.png');

ws.close();
chrome.kill();
process.exit(0);
