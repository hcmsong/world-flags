// 사용: node tools/offline_real.mjs [실주소]  — 실주소: 1단계 온라인 설치 → Chrome 종료 → 2단계 호스트 차단 후 같은 프로필로 재실행
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os'; import { join } from 'path';
const URL_ = process.argv[2] || 'https://hcmsong.github.io/world-flags/';
const PROFILE = mkdtempSync(join(tmpdir(), 'wf-prof-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(extra, fn) {
  const c = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new','--disable-gpu','--remote-debugging-port=19231','--no-first-run','--disable-extensions',
     `--user-data-dir=${PROFILE}`, ...extra, 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i=0;i<30;i++){ try{ tabs = await (await fetch('http://127.0.0.1:19231/json')).json(); break;}catch{ await sleep(300);} }
  const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map();
  ws.onmessage = e => { const m=JSON.parse(e.data); if (m.id&&pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);} };
  const send=(method,params={})=>new Promise(r=>{const i=++id; pend.set(i,r); ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true}); return r.result?.result?.value;};
  try { await fn(send, ev); } finally { ws.close(); c.kill(); await sleep(1500); }
}
let ok=0, bad=0; const a=(n,c)=>{ c?ok++:bad++; console.log((c?'✓ ':'✗ ')+n); };
await run([], async (send, ev) => {
  await send('Page.navigate',{url:URL_}); await sleep(1500);
  for (let i=0;i<40;i++){ const n=await ev(`(async()=>{const k=await caches.keys(); const c=k.find(x=>x.startsWith('flag-game-')); return c?(await (await caches.open(c)).keys()).length:0})()`); if (n>=200) break; await sleep(500);} 
  const st = await ev(`(async()=>{const k=await caches.keys(); const c=k.find(x=>x.startsWith('flag-game-')); const n=c?(await (await caches.open(c)).keys()).length:0; return {k, n, ctl: !!navigator.serviceWorker.controller};})()`);
  console.log('1단계 캐시:', JSON.stringify(st));
  a('온라인 설치: 캐시 생성(자산 200개 이상)', st && st.n >= 200);
});
await run(['--host-resolver-rules=MAP hcmsong.github.io 127.0.0.1:9'], async (send, ev) => {
  await send('Page.navigate',{url:URL_}); await sleep(3000);
  a('차단 상태 제목 «국기 놀이»', await ev('document.title') === '국기 놀이');
  a('차단 상태 홈 화면', await ev('!!document.querySelector(".home-title")'));
  const net = await ev(`fetch('https://hcmsong.github.io/robots-x?'+Date.now()).then(()=> 'reach').catch(()=> 'blocked')`);
  a('주소 실제 차단 확인(캐시 밖 요청 실패)', net === 'blocked');
  const aud = await ev(`fetch('audio/KR.m4a',{headers:{Range:'bytes=0-1'}}).then(r=>r.status+':'+r.headers.get('content-range')).catch(e=>'ERR '+e.message)`);
  a('차단 상태 음성 Range 206 '+aud, String(aud).startsWith('206'));
  const full0 = await ev(`fetch('audio/KR.m4a',{headers:{Range:'bytes=0-1'}, cache:'no-store'}).then(r=>r.status).catch(e=>'ERR '+e.message)`); console.log('no-store Range:', full0);
  const full = await ev(`fetch('audio/BR.m4a').then(r=>r.status+':'+r.headers.get('content-type'))`);
  a('차단 상태 음성 전체 '+full, String(full).startsWith('200'));
});
console.log(`결과: ${ok}개 통과, ${bad}개 실패`);
