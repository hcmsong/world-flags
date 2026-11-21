#!/usr/bin/env node
// build_assets.mjs — app/ 디렉터리를 스캔하여 ASSETS 목록을 config.js / sw.js 에 쓴다.
// 사용: node tools/build_assets.mjs
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const APP = fileURLToPath(new URL('..', import.meta.url));

function scan(dir, base = APP) {
  const result = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const rel = './' + relative(base, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) {
      if (name === 'tools') continue; // 도구 폴더 제외
      result.push(...scan(full, base));
    } else {
      result.push(rel);
    }
  }
  return result;
}

// './' 항목을 맨 앞에
const files = scan(APP);
const assets = ['./', ...files.filter(f => f !== './')];
const list = JSON.stringify(assets, null, 2).replace(/\n/g, '\n  ');

// config.js 업데이트
const configPath = join(APP, 'config.js');
let cfg = readFileSync(configPath, 'utf8');
cfg = cfg.replace(/ASSETS:\s*\[[\s\S]*?\]/, `ASSETS: ${list}`);
writeFileSync(configPath, cfg, 'utf8');
console.log('config.js ASSETS 업데이트 완료');

// sw.js 업데이트
const swPath = join(APP, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = ${list};`);
writeFileSync(swPath, sw, 'utf8');
console.log('sw.js ASSETS 업데이트 완료');

console.log(`총 ${assets.length}개 항목:`);
assets.forEach(a => console.log('  ' + a));
