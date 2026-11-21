#!/usr/bin/env node
// check.mjs — 빌드 무결성 검사 + BUILD 해시 갱신
// 사용: node tools/check.mjs [--write]
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const WRITE = process.argv.includes('--write');
const APP = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const warns = [];
let ok = 0;

function pass(msg) { console.log('  ✓ ' + msg); ok++; }
function fail(msg) { console.error('  ✗ ' + msg); errors.push(msg); }
function warn(msg) { console.warn('  ⚠ ' + msg); warns.push(msg); }

// config.js 읽기
const cfgSrc = readFileSync(join(APP, 'config.js'), 'utf8');
function extractCfgAssets() {
  const m = cfgSrc.match(/ASSETS:\s*(\[[\s\S]*?\])/);
  if (!m) return null;
  return JSON.parse(m[1]);
}
function extractCfgVersion() {
  const m = cfgSrc.match(/VERSION:\s*'([^']+)'/);
  return m ? m[1] : null;
}

// sw.js 읽기
const swSrc = readFileSync(join(APP, 'sw.js'), 'utf8');
function extractSwAssets() {
  const m = swSrc.match(/const ASSETS = (\[[\s\S]*?\]);/);
  if (!m) return null;
  return JSON.parse(m[1]);
}
function extractSwVersion() {
  const m = swSrc.match(/const VERSION = '([^']+)'/);
  return m ? m[1] : null;
}
function extractSwBuild() {
  const m = swSrc.match(/const BUILD = '([^']+)'/);
  return m ? m[1] : null;
}

console.log('\n=== 국기 놀이 빌드 검사 ===\n');

// 1. VERSION 일치
const cfgVer = extractCfgVersion();
const swVer = extractSwVersion();
if (cfgVer && swVer && cfgVer === swVer) pass(`VERSION 일치: ${cfgVer}`);
else fail(`VERSION 불일치: config.js=${cfgVer}, sw.js=${swVer}`);

// 2. ASSETS 일치
const cfgAssets = extractCfgAssets();
const swAssets = extractSwAssets();
if (!cfgAssets) fail('config.js ASSETS 파싱 실패');
else if (!swAssets) fail('sw.js ASSETS 파싱 실패');
else {
  const cfgStr = JSON.stringify(cfgAssets.slice().sort());
  const swStr = JSON.stringify(swAssets.slice().sort());
  if (cfgStr === swStr) pass(`ASSETS 일치 (${cfgAssets.length}개)`);
  else {
    const missing = cfgAssets.filter(a => !swAssets.includes(a));
    const extra = swAssets.filter(a => !cfgAssets.includes(a));
    fail(`ASSETS 불일치: config 미포함=${JSON.stringify(missing)}, sw 미포함=${JSON.stringify(extra)}`);
  }
}

// 3. ASSETS 파일 존재 확인
const assets = cfgAssets || [];
let missingFiles = 0;
for (const a of assets) {
  if (a === './') continue;
  const full = join(APP, a.replace(/^\.\//, ''));
  if (!existsSync(full)) { fail(`파일 없음: ${a}`); missingFiles++; }
}
if (missingFiles === 0 && assets.length > 1) pass(`ASSETS 파일 ${assets.length - 1}개 존재 확인`);
else if (missingFiles > 0) fail(`${missingFiles}개 파일 없음`);

// 4. 나라 데이터 검사
const dataSrc = readFileSync(join(APP, 'data/countries.js'), 'utf8');
const isSample = dataSrc.includes('견본') || dataSrc.includes('// sample');
if (isSample) {
  warn('countries.js 견본 데이터 — 나라 수·easy 비율 검사 건너뜀');
} else {
  // self.FLAG_DATA 평가 (Node.js global 활용)
  try {
    const vm = await import('vm');
    const ctx = { self: {} };
    vm.createContext(ctx);
    vm.runInContext(dataSrc, ctx);
    const data = ctx.self.FLAG_DATA;
    const total = data.countries.length;
    const easyCount = data.countries.filter(c => c.easy).length;
    const pct = easyCount / total * 100;
    if (total >= 194) pass(`나라 수: ${total}개`);
    else fail(`나라 수 부족: ${total}개 (194 이상 필요)`);
    // 확정 데이터: easy 47개/194개 = 24.2% — 절대 개수로 검사(최소 40개)
    if (easyCount >= 40) pass(`easy 수: ${easyCount}개 (${pct.toFixed(1)}%, 40개 이상)`);
    else fail(`easy 수 부족: ${easyCount}개 (40 이상 필요)`);
    // 필수 필드 확인
    const bad = data.countries.filter(c => !c.code || !c.ko || !c.en || !c.region);
    if (bad.length === 0) pass('모든 나라 필수 필드 OK');
    else fail(`필수 필드 누락 ${bad.length}개: ${bad.slice(0, 3).map(c => c.code).join(', ')}`);
    // 북한 포함, 팔레스타인/대만 제외
    if (data.countries.some(c => c.code === 'KP')) pass('북한(KP) 포함');
    else warn('북한(KP) 없음');
    const banned = ['PS', 'TW', 'XK'].filter(code => data.countries.some(c => c.code === code));
    if (banned.length === 0) pass('팔레스타인/대만/코소보 미포함');
    else fail(`제외 대상 포함: ${banned.join(', ')}`);
  } catch (e) {
    fail('countries.js VM 평가 실패: ' + e.message);
  }
}

// 5. 외부 URL 없음
const jsFiles = ['app.js', 'config.js', 'sw.js', 'data/countries.js'];
let extUrls = 0;
for (const f of jsFiles) {
  const src = readFileSync(join(APP, f), 'utf8');
  const hits = src.match(/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)[a-z0-9.-]+/gi) || [];
  if (hits.length) { warn(`외부 URL in ${f}: ${hits.slice(0, 3).join(', ')}`); extUrls++; }
}
const htmlSrc = readFileSync(join(APP, 'index.html'), 'utf8');
const htmlExt = htmlSrc.match(/https?:\/\/[a-z0-9.-]+/gi) || [];
if (htmlExt.length) { warn(`외부 URL in index.html: ${htmlExt.slice(0, 3).join(', ')}`); extUrls++; }
if (extUrls === 0) pass('외부 URL 없음');

// 6. BUILD 해시 계산 및 (--write 시) sw.js 갱신
const hash = createHash('sha256');
let canHash = true;
for (const a of assets) {
  if (a === './' || a === './sw.js') continue; // sw.js 는 BUILD 자기참조로 제외
  const full = join(APP, a.replace(/^\.\//, ''));
  if (!existsSync(full)) { canHash = false; break; }
  hash.update(readFileSync(full));
}
if (canHash) {
  const newBuild = hash.digest('hex').slice(0, 16);
  const curBuild = extractSwBuild();
  if (curBuild === newBuild) pass(`BUILD 해시 최신: ${newBuild}`);
  else {
    warn(`BUILD 해시 구버전: ${curBuild} → ${newBuild}`);
    if (WRITE) {
      const updated = swSrc.replace(/const BUILD = '[^']*'/, `const BUILD = '${newBuild}'`);
      writeFileSync(join(APP, 'sw.js'), updated, 'utf8');
      console.log(`  → sw.js BUILD 갱신: ${newBuild}`);
    } else {
      console.log('  → --write 를 추가하면 자동 갱신합니다.');
    }
  }
} else {
  warn('일부 파일 없어 BUILD 해시 계산 불가');
}

// 결과
console.log(`\n결과: ${ok}개 통과, ${warns.length}개 경고, ${errors.length}개 오류\n`);
if (errors.length) {
  console.error('오류가 있습니다. 확인 후 재실행하세요.');
  process.exit(1);
} else {
  console.log('검사 통과!');
}
