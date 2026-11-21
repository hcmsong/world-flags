#!/usr/bin/env node
// 화면 캡처 스크립트
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const execP = promisify(exec);
const BASE = 'http://127.0.0.1:8766';
const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Chrome 시작
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=19224', '--disable-extensions',
  '--disable-background-networking', '--no-first-run',
], { stdio: 'pipe', detached: false });
await sleep(1500);

const info = JSON.parse((await execP('curl -s http://localhost:19224/json')).stdout);
const wsUrl = info[0]?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error('Chrome CDP URL 없음');

const { WebSocket } = await import('ws');
const cdpWs = new WebSocket(wsUrl);
await new Promise((res, rej) => { cdpWs.once('open', res); cdpWs.once('error', rej); });

let msgId = 0;
const pending = new Map();
cdpWs.on('message', raw => {
  const msg = JSON.parse(raw);
  if (msg.id !== undefined) {
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  }
});
const send = (method, params = {}) => {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    cdpWs.send(JSON.stringify({ id, method, params }));
  });
};

await send('Page.enable');
await send('Runtime.enable');

const nav = async url => {
  await send('Page.navigate', { url });
  await sleep(1500);
};
const ev = async js => {
  const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};
const resetState = async () => {
  await ev('try { localStorage.setItem("flagGame.state", JSON.stringify({screen:"home",ver:"v1",easyRoundsSinceBreak:0,savedAt:Date.now()})); } catch {}');
};

const shot = async (name, w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png', quality: 90 });
  const path = `${SHOTS}/${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  저장: ${name}.png (${w}×${h})`);
};

// ── 가로 (1133×744) / 세로 (820×1180) ──
const L = (name) => shot(name, 1133, 744);
const P = (name) => shot(name, 820, 1180);

try {
  // 1. 홈 화면
  await nav(BASE + '/');
  await resetState(); await nav(BASE + '/');
  await L('홈_가로'); await P('홈_세로');

  // 2. 쉬운 놀이 — 문제
  await resetState(); await nav(BASE + '/');
  await ev('document.getElementById("btn-easy")?.click()');
  await sleep(800);
  await L('쉬운놀이_문제_가로'); await P('쉬운놀이_문제_세로');

  // 3. 쉬운 놀이 — 정답 (data-answer 속성으로 정답 코드 찾기)
  await ev(`
    (function(){
      try {
        // 정답 버튼: data-answer 속성이 있거나, 문제 이름과 일치하는 버튼
        const answerEl = document.querySelector('[data-answer]');
        const ans = answerEl ? answerEl.dataset.answer : null;
        const btns = document.querySelectorAll(".flag-btn");
        if (ans) {
          for(const b of btns){ if(b.dataset.code === ans){ b.click(); return; } }
        }
        btns[0].click();
      } catch(e) { document.querySelectorAll(".flag-btn")[0]?.click(); }
    })()
  `);
  await sleep(800);
  await L('쉬운놀이_정답_가로'); await P('쉬운놀이_정답_세로');

  // 4. 쉬운 놀이 — 오답 (wrong button)
  await resetState(); await nav(BASE + '/');
  await ev('document.getElementById("btn-easy")?.click()');
  await sleep(800);
  // 정답이 아닌 버튼 클릭
  await ev(`
    (function(){
      const btns = document.querySelectorAll(".flag-btn");
      const answerEl = document.querySelector("[data-answer]");
      const ans = answerEl ? answerEl.dataset.answer : null;
      for(const b of btns){ if(b.dataset.code !== ans){ b.click(); return; } }
      btns[btns.length-1].click();
    })()
  `);
  await sleep(800);
  await L('쉬운놀이_오답_가로'); await P('쉬운놀이_오답_세로');

  // 5. 쉬운 놀이 — 결과 (5문제 완료 시뮬레이션)
  await resetState(); await nav(BASE + '/');
  // 결과 화면 직접 렌더링
  await ev(`
    try {
      const state = JSON.parse(localStorage.getItem('flagGame.state') || '{}');
      state.screen = 'easy_result';
      state.easyScore = 4;
      state.easyTotal = 5;
      localStorage.setItem('flagGame.state', JSON.stringify(state));
    } catch {}
  `);
  await nav(BASE + '/');
  await sleep(1000);
  await L('쉬운놀이_결과_가로'); await P('쉬운놀이_결과_세로');

  // 6. 국기 박사 — 지역 고르기
  await resetState(); await nav(BASE + '/');
  await ev('document.getElementById("btn-expert")?.click()');
  await sleep(800);
  await L('국기박사_지역고르기_가로'); await P('국기박사_지역고르기_세로');

  // 7. 국기 박사 — 이름 고르기 문제
  await ev('document.querySelectorAll(".btn-region")[0]?.click()');
  await sleep(600);
  await ev('document.getElementById("m-f2n")?.click()');
  await sleep(800);
  await L('국기박사_이름고르기_가로'); await P('국기박사_이름고르기_세로');

  // 8. 국기 박사 — 국기 고르기 문제
  await resetState(); await nav(BASE + '/');
  await ev('document.getElementById("btn-expert")?.click()');
  await sleep(600);
  await ev('document.querySelectorAll(".btn-region")[1]?.click()');
  await sleep(600);
  await ev('document.getElementById("m-n2f")?.click()');
  await sleep(800);
  await L('국기박사_국기고르기_가로'); await P('국기박사_국기고르기_세로');

  // 9. 국기 박사 — 결과
  await resetState(); await nav(BASE + '/');
  await ev(`
    try {
      const state = JSON.parse(localStorage.getItem('flagGame.state') || '{}');
      state.screen = 'expert_result';
      state.expertScore = 8;
      state.expertTotal = 10;
      localStorage.setItem('flagGame.state', JSON.stringify(state));
    } catch {}
  `);
  await nav(BASE + '/');
  await sleep(1000);
  await L('국기박사_결과_가로'); await P('국기박사_결과_세로');

  // 10. 도감 (컬렉션 10개 이상 세팅)
  await ev(`
    try {
      const known = ["KR","JP","US","GB","FR","DE","CN","BR","AU","CA","IN","IT"];
      localStorage.setItem("flagGame.collection", JSON.stringify(known));
    } catch {}
  `);
  await resetState(); await nav(BASE + '/');
  await ev('document.getElementById("btn-coll")?.click()');
  await sleep(800);
  await L('도감_가로'); await P('도감_세로');

  // 11. 도감 카드 (첫 번째 수집된 항목 클릭)
  await ev('document.querySelector(".coll-item:not(.unseen)")?.dispatchEvent(new PointerEvent("pointerup", {bubbles:true, clientX: 50, clientY: 50}))');
  await sleep(800);
  await L('도감카드_가로'); await P('도감카드_세로');
  // 오버레이 닫기
  await ev('document.getElementById("card-close")?.click()');
  await sleep(400);

  // 12. 쉬는 시간
  await resetState(); await nav(BASE + '/');
  await ev(`
    try {
      const state = JSON.parse(localStorage.getItem('flagGame.state') || '{}');
      state.screen = 'break';
      localStorage.setItem('flagGame.state', JSON.stringify(state));
    } catch {}
  `);
  await nav(BASE + '/');
  await sleep(1000);
  await L('쉬는시간_가로'); await P('쉬는시간_세로');

  // 13. 부모 설정 (⚙️ 길게 누르기 시뮬레이션)
  await resetState(); await nav(BASE + '/');
  await sleep(500);
  // pointerdown → hold 2.2초 → 설정 패널 열림
  await ev(`
    (function(){
      const gear = document.querySelector('.gear-btn');
      if (!gear) return;
      gear.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:50, clientY:50}));
    })()
  `);
  await sleep(2300); // SETTINGS_HOLD_MS=2000ms + 여유
  await L('부모설정_가로'); await P('부모설정_세로');

  console.log('\n캡처 완료!');
} finally {
  cdpWs.close();
  chrome.kill();
}
