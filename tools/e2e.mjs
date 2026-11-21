#!/usr/bin/env node
// e2e.mjs — Headless Chrome CDP 기반 통합 테스트 (온라인 + 오프라인)
// 사용: node tools/e2e.mjs [서버URL]  예: node tools/e2e.mjs http://localhost:8080
// 환경변수: CHROME_EXTRA="--arg1||--arg2" (|| 구분자)
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execP = promisify(exec);
const APP = fileURLToPath(new URL('..', import.meta.url));
const BASE_URL = process.argv[2] || 'http://localhost:18099';
const PORT = parseInt(new URL(BASE_URL).port || '80', 10);
let testServer = null;

// MIME 간단 매핑
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.m4a': 'audio/mp4',
};

// 정적 서버 시작
async function startServer() {
  return new Promise(res => {
    testServer = createServer((req, rsp) => {
      const url = req.url.split('?')[0];
      const file = url === '/' ? '/index.html' : url;
      const full = join(APP, file);
      if (existsSync(full)) {
        const data = readFileSync(full);
        rsp.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
        rsp.end(data);
      } else {
        rsp.writeHead(404); rsp.end('Not found');
      }
    }).listen(PORT, '127.0.0.1', () => { console.log(`서버 시작: ${BASE_URL}`); res(); });
  });
}

// Chrome CDP
let ws, cdpSend, cdpWs;
let msgId = 0;
const pending = new Map();
const events = new Map();

async function connectChrome() {
  // Chrome 실행
  const extra = (process.env.CHROME_EXTRA || '').split('||').filter(Boolean);
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=19223', '--disable-extensions',
    '--disable-background-networking', '--disable-sync',
    '--disable-default-apps', '--no-first-run',
    ...extra,
  ];
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args, {
    stdio: 'pipe', detached: false,
  });
  await new Promise(r => setTimeout(r, 1200));

  // WebSocket URL
  const info = JSON.parse((await execP('curl -s http://localhost:19223/json')).stdout);
  const wsUrl = info[0]?.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('Chrome CDP URL 없음');

  // 동적 ws import
  const { WebSocket } = await import('ws').catch(() => ({ WebSocket: global.WebSocket }));
  cdpWs = new WebSocket(wsUrl);
  await new Promise((res, rej) => { cdpWs.once('open', res); cdpWs.once('error', rej); });

  cdpSend = (method, params = {}) => {
    const id = ++msgId;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      cdpWs.send(JSON.stringify({ id, method, params }));
    });
  };

  cdpWs.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
    } else if (msg.method) {
      (events.get(msg.method) || []).forEach(fn => fn(msg.params));
    }
  });

  return chrome;
}

const nav = async url => {
  await cdpSend('Page.navigate', { url });
  await sleep(1200); // 페이지 로드 대기 (Page.loadEventFired는 이벤트라 명령으로 사용 불가)
};
const ev = async js => (await cdpSend('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })).result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 테스트 헬퍼
let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label); failed++; }
}

// ── 테스트 본문 ──────────────────────────────────────────────────────────
let chrome;
try {
  if (/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE_URL)) await startServer();
  chrome = await connectChrome();
  await cdpSend('Page.enable');
  await cdpSend('Network.enable');
  await cdpSend('ServiceWorker.enable');

  // ── 1. 홈 화면 로드 (온라인) ────────────────────────────────────────
  console.log('\n=== 테스트 1: 홈 화면 로드 ===');
  await nav(BASE_URL + '/');
  await sleep(1000);

  const title = await ev('document.title');
  assert('페이지 제목: 국기 놀이', title === '국기 놀이');

  const homeTitle = await ev('document.querySelector(".home-title")?.textContent');
  assert('홈 타이틀 존재', homeTitle && homeTitle.includes('국기 놀이'));

  const btnEasy = await ev('!!document.getElementById("btn-easy")');
  assert('쉬운 놀이 버튼 존재', btnEasy);

  const btnExpert = await ev('!!document.getElementById("btn-expert")');
  assert('국기 박사 버튼 존재', btnExpert);

  const btnColl = await ev('!!document.getElementById("btn-coll")');
  assert('도감 버튼 존재', btnColl);

  const statusBar = await ev('document.querySelector(".status-bar")?.textContent');
  assert('상태 바 존재', !!statusBar);

  // ── 2. SW 등록 대기 ─────────────────────────────────────────────────
  console.log('\n=== 테스트 2: 서비스 워커 ===');
  await sleep(2000);
  const swReg = await ev('"serviceWorker" in navigator');
  assert('서비스 워커 지원', swReg);

  // ── 3. 쉬운 놀이 흐름 ───────────────────────────────────────────────
  console.log('\n=== 테스트 3: 쉬운 놀이 ===');
  await ev('document.getElementById("btn-easy")?.click()');
  await sleep(600);

  const easyScreen = await ev('document.querySelector(".easy-q") !== null || document.querySelector(".easy-choices") !== null');
  assert('쉬운 놀이 화면 진입', easyScreen);

  const choices = await ev('document.querySelectorAll(".flag-btn").length');
  assert('보기 버튼 3개', choices === 3);

  const nameKo = await ev('document.querySelector(".name-ko")?.textContent');
  assert('한국어 나라 이름 표시', nameKo && nameKo.length > 0);

  const nameEn = await ev('document.querySelector(".name-en")?.textContent');
  assert('영문 나라 이름 표시', nameEn && nameEn.length > 0);

  // 첫 번째 보기 클릭 → 피드백
  await ev('document.querySelectorAll(".flag-btn")[0]?.dispatchEvent(new MouseEvent("click", {bubbles:true}))');
  await sleep(600);
  const feedback = await ev('document.querySelector(".easy-fb") !== null');
  assert('답 클릭 후 피드백 화면', feedback);

  // ── 4. 국기 박사 흐름 ───────────────────────────────────────────────
  console.log('\n=== 테스트 4: 국기 박사 ===');
  // 상태 초기화 후 재로드
  await ev('try { localStorage.setItem("flagGame.state", JSON.stringify({screen:"home",ver:"v1",easyRoundsSinceBreak:0,savedAt:Date.now()})); } catch {}');
  await nav(BASE_URL + '/');
  await sleep(800);
  await ev('document.getElementById("btn-expert")?.click()');
  await sleep(800);
  const regionScreen = await ev('document.querySelector(".region-grid") !== null');
  assert('지역 선택 화면', regionScreen);

  await ev('document.querySelectorAll(".btn-region")[0]?.click()');
  await sleep(400);
  const modeScreen = await ev('document.querySelector(".mode-btns") !== null');
  assert('모드 선택 화면', modeScreen);

  await ev('document.getElementById("m-f2n")?.click()');
  await sleep(600);
  const expertQ = await ev('document.querySelector(".expert-q") !== null');
  assert('국기 박사 문제 화면', expertQ);

  const expertChoices = await ev('document.querySelectorAll(".expert-name-btn").length');
  assert('이름 보기 버튼 4개', expertChoices === 4);

  // ── 5. 도감 화면 ─────────────────────────────────────────────────────
  console.log('\n=== 테스트 5: 도감 ===');
  await ev('try { localStorage.setItem("flagGame.state", JSON.stringify({screen:"home",ver:"v1",easyRoundsSinceBreak:0,savedAt:Date.now()})); } catch {}');
  await nav(BASE_URL + '/');
  await sleep(800);
  await ev('document.getElementById("btn-coll")?.click()');
  await sleep(800);
  const collScreen = await ev('document.querySelector(".collection") !== null');
  assert('도감 화면 진입', collScreen);

  const collTitle = await ev('document.querySelector(".coll-title")?.textContent');
  assert('도감 제목 존재', collTitle && collTitle.includes('도감'));

  // ── 6. 오프라인 모드 (캐시에 의존) ─────────────────────────────────
  console.log('\n=== 테스트 6: 오프라인 (네트워크 차단) ===');
  await ev('try { localStorage.setItem("flagGame.state", JSON.stringify({screen:"home",ver:"v1",easyRoundsSinceBreak:0,savedAt:Date.now()})); } catch {}');
  await nav(BASE_URL + '/');
  await sleep(2500); // SW 활성화 + 캐시 완료 대기
  await cdpSend('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  await sleep(400);
  await cdpSend('Page.reload');
  await sleep(2000);
  const offlineTitle = await ev('document.title');
  assert('오프라인에서도 페이지 로드', offlineTitle === '국기 놀이');
  const offlineHome = await ev('!!document.querySelector(".home-title")');
  assert('오프라인 홈 화면 표시', offlineHome);
  // 네트워크 복구
  await cdpSend('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  // ── 7. 개인정보 없음 확인 ─────────────────────────────────────────────
  console.log('\n=== 테스트 7: 개인정보 보호 ===');
  const storage = await ev('JSON.stringify(Object.entries(localStorage).map(([k])=>k))');
  const keys = JSON.parse(storage || '[]');
  const hasPersonal = keys.some(k => k.match(/name|아이|이름/i));
  assert('localStorage에 아이 이름 없음', !hasPersonal);
  const allFlagGame = keys.every(k => !k || k.startsWith('flagGame.'));
  assert('localStorage 키 접두사 flagGame.*', allFlagGame || keys.length === 0);

} finally {
  cdpWs?.close();
  if (chrome) chrome.kill();
  testServer?.close();
  console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
  if (failed > 0) process.exit(1);
}
