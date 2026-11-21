#!/usr/bin/env node
// build_data.mjs — data/countries_final.json → app/data/countries.js
// 사용: node tools/build_data.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const APP   = fileURLToPath(new URL('..', import.meta.url));
const ROOT  = join(APP, '..');
const SRC   = join(ROOT, 'data', 'countries_final.json');
const DST   = join(APP,  'data', 'countries.js');

// 한국어 지역명 → 영어 키
const REGION_MAP = {
  '아시아':     'asia',
  '유럽':       'europe',
  '아프리카':   'africa',
  '북아메리카': 'north_america',
  '남아메리카': 'south_america',
  '오세아니아': 'oceania',
};

const raw = JSON.parse(readFileSync(SRC, 'utf8'));

const countries = raw.countries.map(c => {
  const region = REGION_MAP[c.region];
  if (!region) throw new Error(`알 수 없는 지역: ${c.region} (${c.code})`);
  const entry = { code: c.code, ko: c.ko, en: c.en, region };
  if (c.easy) entry.easy = true;
  return entry;
});

const similar = raw.similar; // [[code, ...], ...]

// 검증
const codes = countries.map(c => c.code);
const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
if (dupCodes.length) throw new Error(`중복 코드: ${dupCodes.join(', ')}`);

const allSimCodes = similar.flat();
const badSim = allSimCodes.filter(c => !codes.includes(c));
if (badSim.length) throw new Error(`similar에 없는 코드: ${badSim.join(', ')}`);

// 직렬화 (한 줄 한 나라)
function serializeCountries(arr) {
  const lines = arr.map(c => {
    const parts = [
      `code: '${c.code}'`,
      `ko: '${c.ko.replace(/'/g, "\\'")}' `,
      `en: '${c.en.replace(/'/g, "\\'")}'`,
      `region: '${c.region}'`,
    ];
    if (c.easy) parts.push('easy: true');
    return '    { ' + parts.join(', ') + ' }';
  });
  return '[\n' + lines.join(',\n') + '\n  ]';
}

function serializeSimilar(arr) {
  const lines = arr.map(g => '    ' + JSON.stringify(g));
  return '[\n' + lines.join(',\n') + '\n  ]';
}

const out = `// 국기 놀이 — 나라 데이터 (194개국, build_data.mjs 자동 생성)
// 원본: data/countries_final.json
self.FLAG_DATA = {
  countries: ${serializeCountries(countries)},
  similar: ${serializeSimilar(similar)},
  regions: ['asia', 'europe', 'africa', 'north_america', 'south_america', 'oceania'],
};
`;

writeFileSync(DST, out, 'utf8');
console.log(`생성 완료: ${DST}`);
console.log(`  나라 수: ${countries.length}개`);
console.log(`  easy 수: ${countries.filter(c => c.easy).length}개`);
console.log(`  similar 묶음: ${similar.length}개`);
