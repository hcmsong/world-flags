// 서비스 워커: 처음 한 번 온라인에서 파일을 모두 기기 안에 저장하고, 그 뒤로는 저장본으로 연다.
// 판·데이터를 고치면 VERSION 을 올린다(config.js VERSION 과 같게).
const VERSION = 'v1';
const BUILD = 'cf9ddad5f5d031f0'; // 자산 내용 해시 — node tools/check.mjs --write 가 채운다
const CACHE = 'flag-game-' + VERSION;
const ASSETS = [
    "./",
    "./app.js",
    "./audio/AD.m4a",
    "./audio/AE.m4a",
    "./audio/AF.m4a",
    "./audio/AG.m4a",
    "./audio/AL.m4a",
    "./audio/AM.m4a",
    "./audio/AO.m4a",
    "./audio/AR.m4a",
    "./audio/AT.m4a",
    "./audio/AU.m4a",
    "./audio/AZ.m4a",
    "./audio/BA.m4a",
    "./audio/BB.m4a",
    "./audio/BD.m4a",
    "./audio/BE.m4a",
    "./audio/BF.m4a",
    "./audio/BG.m4a",
    "./audio/BH.m4a",
    "./audio/BI.m4a",
    "./audio/BJ.m4a",
    "./audio/BN.m4a",
    "./audio/BO.m4a",
    "./audio/BR.m4a",
    "./audio/BS.m4a",
    "./audio/BT.m4a",
    "./audio/BW.m4a",
    "./audio/BY.m4a",
    "./audio/BZ.m4a",
    "./audio/CA.m4a",
    "./audio/CD.m4a",
    "./audio/CF.m4a",
    "./audio/CG.m4a",
    "./audio/CH.m4a",
    "./audio/CI.m4a",
    "./audio/CL.m4a",
    "./audio/CM.m4a",
    "./audio/CN.m4a",
    "./audio/CO.m4a",
    "./audio/CR.m4a",
    "./audio/CU.m4a",
    "./audio/CV.m4a",
    "./audio/CY.m4a",
    "./audio/CZ.m4a",
    "./audio/DE.m4a",
    "./audio/DJ.m4a",
    "./audio/DK.m4a",
    "./audio/DM.m4a",
    "./audio/DO.m4a",
    "./audio/DZ.m4a",
    "./audio/EC.m4a",
    "./audio/EE.m4a",
    "./audio/EG.m4a",
    "./audio/ER.m4a",
    "./audio/ES.m4a",
    "./audio/ET.m4a",
    "./audio/FI.m4a",
    "./audio/FJ.m4a",
    "./audio/FM.m4a",
    "./audio/FR.m4a",
    "./audio/GA.m4a",
    "./audio/GB.m4a",
    "./audio/GD.m4a",
    "./audio/GE.m4a",
    "./audio/GH.m4a",
    "./audio/GM.m4a",
    "./audio/GN.m4a",
    "./audio/GQ.m4a",
    "./audio/GR.m4a",
    "./audio/GT.m4a",
    "./audio/GW.m4a",
    "./audio/GY.m4a",
    "./audio/HN.m4a",
    "./audio/HR.m4a",
    "./audio/HT.m4a",
    "./audio/HU.m4a",
    "./audio/ID.m4a",
    "./audio/IE.m4a",
    "./audio/IL.m4a",
    "./audio/IN.m4a",
    "./audio/IQ.m4a",
    "./audio/IR.m4a",
    "./audio/IS.m4a",
    "./audio/IT.m4a",
    "./audio/JM.m4a",
    "./audio/JO.m4a",
    "./audio/JP.m4a",
    "./audio/KE.m4a",
    "./audio/KG.m4a",
    "./audio/KH.m4a",
    "./audio/KI.m4a",
    "./audio/KM.m4a",
    "./audio/KN.m4a",
    "./audio/KP.m4a",
    "./audio/KR.m4a",
    "./audio/KW.m4a",
    "./audio/KZ.m4a",
    "./audio/LA.m4a",
    "./audio/LB.m4a",
    "./audio/LC.m4a",
    "./audio/LI.m4a",
    "./audio/LK.m4a",
    "./audio/LR.m4a",
    "./audio/LS.m4a",
    "./audio/LT.m4a",
    "./audio/LU.m4a",
    "./audio/LV.m4a",
    "./audio/LY.m4a",
    "./audio/MA.m4a",
    "./audio/MC.m4a",
    "./audio/MD.m4a",
    "./audio/ME.m4a",
    "./audio/MG.m4a",
    "./audio/MH.m4a",
    "./audio/MK.m4a",
    "./audio/ML.m4a",
    "./audio/MM.m4a",
    "./audio/MN.m4a",
    "./audio/MR.m4a",
    "./audio/MT.m4a",
    "./audio/MU.m4a",
    "./audio/MV.m4a",
    "./audio/MW.m4a",
    "./audio/MX.m4a",
    "./audio/MY.m4a",
    "./audio/MZ.m4a",
    "./audio/NA.m4a",
    "./audio/NE.m4a",
    "./audio/NG.m4a",
    "./audio/NI.m4a",
    "./audio/NL.m4a",
    "./audio/NO.m4a",
    "./audio/NP.m4a",
    "./audio/NR.m4a",
    "./audio/NZ.m4a",
    "./audio/OM.m4a",
    "./audio/PA.m4a",
    "./audio/PE.m4a",
    "./audio/PG.m4a",
    "./audio/PH.m4a",
    "./audio/PK.m4a",
    "./audio/PL.m4a",
    "./audio/PT.m4a",
    "./audio/PW.m4a",
    "./audio/PY.m4a",
    "./audio/QA.m4a",
    "./audio/RO.m4a",
    "./audio/RS.m4a",
    "./audio/RU.m4a",
    "./audio/RW.m4a",
    "./audio/SA.m4a",
    "./audio/SB.m4a",
    "./audio/SC.m4a",
    "./audio/SD.m4a",
    "./audio/SE.m4a",
    "./audio/SG.m4a",
    "./audio/SI.m4a",
    "./audio/SK.m4a",
    "./audio/SL.m4a",
    "./audio/SM.m4a",
    "./audio/SN.m4a",
    "./audio/SO.m4a",
    "./audio/SR.m4a",
    "./audio/SS.m4a",
    "./audio/ST.m4a",
    "./audio/SV.m4a",
    "./audio/SY.m4a",
    "./audio/SZ.m4a",
    "./audio/TD.m4a",
    "./audio/TG.m4a",
    "./audio/TH.m4a",
    "./audio/TJ.m4a",
    "./audio/TL.m4a",
    "./audio/TM.m4a",
    "./audio/TN.m4a",
    "./audio/TO.m4a",
    "./audio/TR.m4a",
    "./audio/TT.m4a",
    "./audio/TV.m4a",
    "./audio/TZ.m4a",
    "./audio/UA.m4a",
    "./audio/UG.m4a",
    "./audio/US.m4a",
    "./audio/UY.m4a",
    "./audio/UZ.m4a",
    "./audio/VA.m4a",
    "./audio/VC.m4a",
    "./audio/VE.m4a",
    "./audio/VN.m4a",
    "./audio/VU.m4a",
    "./audio/WS.m4a",
    "./audio/YE.m4a",
    "./audio/ZA.m4a",
    "./audio/ZM.m4a",
    "./audio/ZW.m4a",
    "./audio/_ask.m4a",
    "./audio/_done.m4a",
    "./audio/_ng.m4a",
    "./audio/_ok.m4a",
    "./audio/_rest.m4a",
    "./config.js",
    "./data/countries.js",
    "./icon-180.png",
    "./icon-192.png",
    "./icon-512.png",
    "./index.html",
    "./manifest.webmanifest",
    "./style.css",
    "./sw.js"
  ];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('flag-game-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Range 요청(iOS 오디오): Range 헤더 없는 URL로 캐시 조회
    const rangeHeader = req.headers.get('Range');
    const cacheKey = rangeHeader ? new Request(req.url) : req;
    const hit = await cache.match(cacheKey, { ignoreSearch: true });
    if (hit) {
      if (rangeHeader) {
        // 206 Partial Content 응답 생성
        const buf = await hit.arrayBuffer();
        const total = buf.byteLength;
        const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        const start = m && m[1] !== '' ? parseInt(m[1], 10) : 0;
        const end   = m && m[2] !== '' ? parseInt(m[2], 10) : total - 1;
        const slice = buf.slice(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': hit.headers.get('Content-Type') || 'audio/mp4',
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(slice.byteLength),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      return hit;
    }
    if (req.mode === 'navigate') {
      const page = await cache.match('./');
      if (page) return page;
    }
    return fetch(req);
  })());
});
