// 국기 놀이 — 화면·상태 (iPad 오프라인 웹 앱)
(() => {
  'use strict';
  const C = self.FLAG_CONFIG;
  const FD = self.FLAG_DATA;
  const countries = FD.countries;
  const similar = FD.similar; // [[code, code, ...], ...]

  // ── localStorage ────────────────────────────────────────────────────────
  const KEY = {
    state: 'flagGame.state',
    collection: 'flagGame.collection',
    settings: 'flagGame.settings',
    expertPrev: 'flagGame.expertPrev',
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가여도 진행 */ } },
  };

  let collection = store.get(KEY.collection, []);           // ['KR', 'JP', ...]
  let settings   = Object.assign({ sound: C.SOUND, breakAfter: 3 }, store.get(KEY.settings, {}));
  const saveCollection = () => store.set(KEY.collection, collection);
  const saveSettings   = () => store.set(KEY.settings, settings);

  // ── 나라 조회 헬퍼 ──────────────────────────────────────────────────────
  const byCode = Object.fromEntries(countries.map(c => [c.code, c]));
  // localStorage 검증: collection이 올바른 배열이 아니면 정규화
  if (!Array.isArray(collection)) {
    collection = [];
    saveCollection();
  } else {
    collection = [...new Set(collection.filter(c => !!byCode[c]))];
    if (collection.length !== store.get(KEY.collection, []).length) saveCollection();
  }
  // settings 검증
  if (typeof settings.sound !== 'boolean') settings.sound = C.SOUND;
  if (typeof settings.breakAfter !== 'number') settings.breakAfter = 3;
  const flagEmoji = code => [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function nameHtml(ko, en, koClass, enClass) {
    return `<span class="${koClass || 'name-ko'}">${esc(ko)}</span><span class="${enClass || 'name-en'}">${esc(en)}</span>`;
  }
  const regionLabel = r => C.REGION_LABELS[r] || r;

  // ── 상태 ────────────────────────────────────────────────────────────────
  const freshState = () => ({ screen: 'home', easyRoundsSinceBreak: 0, savedAt: Date.now(), ver: C.VERSION });
  let state = store.get(KEY.state, null);
  if (!state || state.ver !== C.VERSION || typeof state.screen !== 'string') {
    state = freshState();
    store.set(KEY.state, state);
  }
  const saveState = () => { state.savedAt = Date.now(); store.set(KEY.state, state); };

  // ── DOM ─────────────────────────────────────────────────────────────────
  const app     = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  // ── 타이머 ──────────────────────────────────────────────────────────────
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; };

  // ── 입력 가드 ────────────────────────────────────────────────────────────
  let guardUntil = 0;
  const now = () => performance.now();

  // ── 입력 차단 ────────────────────────────────────────────────────────────
  ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // ── 화면 켜짐 유지 ────────────────────────────────────────────────────────
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); if (overlay.hidden) render(); } });
  document.addEventListener('pointerdown', () => { unlockAudio(); if (!wakeLock || wakeLock.released) keepAwake(); }, true);

  // ── 오디오 ───────────────────────────────────────────────────────────────
  let actx = null;
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state !== 'running') actx.resume();
      const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource();
      s.buffer = b; s.connect(actx.destination); s.start(0);
    } catch { /* 무시 */ }
    // iOS: 제스처 안에서 Audio 요소 잠금 해제
    try {
      const a = ensureAudio();
      if (!a.dataset.unlocked) {
        a.dataset.unlocked = '1';
        a.muted = true; a.src = './audio/_ok.m4a';
        a.play().then(() => { a.pause(); a.muted = false; a.src = ''; }).catch(() => { a.muted = false; a.src = ''; });
      }
    } catch { /* 무시 */ }
  }
  function tone(t0, f, start, dur, type) {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(C.SOUND_VOLUME, t0 + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
  }
  function sfx(kind) {
    if (!settings.sound || !actx) return;
    try {
      if (actx.state !== 'running') actx.resume();
      const t0 = actx.currentTime + 0.01;
      if (kind === 'ok') { tone(t0, 784, 0, 0.14); tone(t0, 1047, 0.12, 0.26); }
      else if (kind === 'ng') { tone(t0, 330, 0, 0.2, 'triangle'); tone(t0, 247, 0.16, 0.3, 'triangle'); }
      else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(t0, f, i * 0.1, 0.25)); }
    } catch { /* 무시 */ }
  }

  // m4a 보이스 — 단일 Audio 요소 재사용 (iOS 제스처 잠금 해제 유지)
  let activeAudio = null;
  let _audioEl = null;
  function ensureAudio() {
    if (!_audioEl) _audioEl = new Audio();
    return _audioEl;
  }
  function stopVoice() {
    try { const a = ensureAudio(); a.pause(); a.currentTime = 0; } catch { /* 무시 */ }
    activeAudio = null;
  }
  function playVoice(src) {
    if (!settings.sound) return;
    try {
      const a = ensureAudio();
      a.src = src;
      activeAudio = a;
      a.onerror = () => { if (activeAudio === a) activeAudio = null; };
      a.onended = () => { if (activeAudio === a) activeAudio = null; };
      a.play().catch(() => { if (activeAudio === a) activeAudio = null; });
    } catch { /* 무시 */ }
  }
  function playCountryVoice(code) { playVoice(`./audio/${code}.m4a`); }
  function playGuideVoice(name) { playVoice(`./audio/${name}.m4a`); }

  // ── 길게 누르기 ───────────────────────────────────────────────────────────
  function holdable(el, ms, onDone, showFrom) {
    let t0 = 0, raf = 0, active = false;
    const target = el.querySelector('[data-progress]') || el;
    const set = p => target.style.setProperty('--p', p);
    const tick = () => {
      if (!active || !el.isConnected) { active = false; return; }
      const t = now() - t0;
      const from = showFrom || 0;
      set(Math.max(0, Math.min(1, (t - from) / (ms - from))));
      if (t >= ms) { active = false; set(0); onDone(); } else raf = requestAnimationFrame(tick);
    };
    el.addEventListener('pointerdown', e => { e.preventDefault(); active = true; t0 = now(); raf = requestAnimationFrame(tick); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { active = false; cancelAnimationFrame(raf); set(0); }));
  }
  function tap(el, fn) {
    el.addEventListener('pointerup', e => {
      if (now() < guardUntil) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { guardUntil = now() + C.INPUT_GUARD_MS; fn(e); }
    });
    // 데스크톱 click도 지원하되 guard 확인
    el.addEventListener('click', e => { if (now() < guardUntil) return; guardUntil = now() + C.INPUT_GUARD_MS; fn(e); });
  }

  // ── 오프라인 준비 상태 ────────────────────────────────────────────────────
  let offline = { ready: false, checked: false };
  async function checkOffline() {
    let ok = false;
    try {
      const name = 'flag-game-' + C.VERSION;
      if ('caches' in window && navigator.serviceWorker && navigator.serviceWorker.controller && await caches.has(name)) {
        const cache = await caches.open(name);
        const hits = await Promise.all(C.ASSETS.map(a => cache.match(a)));
        ok = hits.every(Boolean);
      }
    } catch { ok = false; }
    offline = { ready: ok, checked: true };
    const el = document.querySelector('.status-bar');
    if (el) el.textContent = statusText();
  }
  const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const statusText = () => `${C.VERSION} · ${isStandalone() ? '웹 앱' : 'Safari'} · 오프라인 준비 ${offline.ready ? '✓' : offline.checked ? '✗' : '…'}`;

  // 새 판 갱신 → 처음 화면에서 자동 reload
  let reloadPending = false;
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then(reg => reg.update().catch(() => {})).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        if (state.screen === 'home') { location.reload(); return; }
        reloadPending = true;
      }
      setTimeout(checkOffline, 300);
    });
  }

  // ── 게임 로직 헬퍼 ───────────────────────────────────────────────────────
  function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function getSimilarGroup(code) {
    return similar.find(g => g.includes(code)) || null;
  }

  // 쉬운 놀이: easy=true 나라들 중 5문제, 보기 3개
  function buildEasyGame() {
    const pool = shuffle(countries.filter(c => c.easy));
    if (pool.length < 3) return null;
    const qcount = Math.min(C.QUESTIONS_EASY, pool.length);
    const questions = [];
    for (let i = 0; i < qcount; i++) {
      const correct = pool[i];
      const simGroup = getSimilarGroup(correct.code);
      const distractors = shuffle(
        pool.filter(c => c.code !== correct.code && !(simGroup && simGroup.includes(c.code)))
      ).slice(0, 2);
      // 보기 2개 부족하면 any로 채움
      if (distractors.length < 2) {
        const any = shuffle(pool.filter(c => c.code !== correct.code && !distractors.some(d => d.code === c.code)));
        while (distractors.length < 2 && any.length) distractors.push(any.shift());
      }
      const choices = shuffle([correct.code, ...distractors.map(d => d.code)]);
      questions.push({ code: correct.code, choices });
    }
    return questions;
  }

  // 이모지로 구별 불가한 쌍 — 같은 문제 보기에서 제외
  const EMOJI_TWIN = new Set(['TD-RO','RO-TD','ID-MC','MC-ID']);

  // 국기 박사: 지역 필터 + 가중치 + 10문제, 보기 4개
  function buildExpertGame(region, mode) {
    const prev = store.get(KEY.expertPrev, []);
    let pool = region === 'all' ? [...countries] : countries.filter(c => c.region === region);
    if (pool.length < 4) return null;
    // 가중치: 못 모은 나라 2배 (중복 제거 후 순서 섞기)
    const weightedUniq = pool.flatMap(c => collection.includes(c.code) ? [c] : [c, c]);
    // 직전 판 겹침 최소화: 아직 못 모은 or 직전에 안 나온 우선
    const prioritized = shuffle(weightedUniq).sort((a, b) => {
      const aP = prev.includes(a.code) ? 1 : 0;
      const bP = prev.includes(b.code) ? 1 : 0;
      return aP - bP;
    });
    const used = new Set();
    const questions = [];
    for (const c of prioritized) {
      if (used.has(c.code)) continue;              // 중복 건너뜀 (break 아님)
      if (questions.length >= C.QUESTIONS_EXPERT) break;
      used.add(c.code);
      const simGroup = getSimilarGroup(c.code);
      let distractors = [];
      // similar 그룹에서 1개 포함(어렵게) — 이모지 쌍은 제외
      if (simGroup) {
        const simCands = shuffle(pool.filter(x =>
          simGroup.includes(x.code) && x.code !== c.code &&
          !EMOJI_TWIN.has(c.code + '-' + x.code)
        ));
        if (simCands.length) distractors.push(simCands[0].code);
      }
      // 같은 지역에서 채움
      const sameRegion = shuffle(pool.filter(x => x.code !== c.code && x.region === c.region && !distractors.includes(x.code)));
      for (const d of sameRegion) { if (distractors.length >= 3) break; distractors.push(d.code); }
      // 부족하면 아무 나라
      const any = shuffle(pool.filter(x => x.code !== c.code && !distractors.includes(x.code)));
      for (const d of any) { if (distractors.length >= 3) break; distractors.push(d.code); }
      const choices = shuffle([c.code, ...distractors.slice(0, 3)]);
      questions.push({ code: c.code, choices });
    }
    if (questions.length < 1) return null;
    store.set(KEY.expertPrev, questions.map(q => q.code));
    return questions;
  }

  // 도감에 추가
  function addToCollection(code) {
    if (!collection.includes(code)) { collection.push(code); saveCollection(); }
  }

  // ── 흐름 제어 ────────────────────────────────────────────────────────────
  function go(screen, extra) {
    state = Object.assign({}, state, extra || {}, { screen });
    saveState();
    render();
  }
  function goHome() {
    stopVoice();
    state = Object.assign(freshState(), { easyRoundsSinceBreak: state.easyRoundsSinceBreak || 0 });
    saveState();
    if (reloadPending) { location.reload(); return; }
    render();
  }
  function maybeBreak(next) { // next = fn
    const ba = settings.breakAfter;
    if (ba > 0 && state.easyRoundsSinceBreak >= ba) {
      go('break', { afterBreak: 'home_callback' });
      state._afterBreakCb = next;
      saveState();
    } else {
      next();
    }
  }

  // ── 그리기 ───────────────────────────────────────────────────────────────
  function render() {
    clearTimers();
    stopVoice();
    guardUntil = now() + C.INPUT_GUARD_MS;
    const fn = {
      home: viewHome,
      easy_question: viewEasyQuestion,
      easy_feedback: viewEasyFeedback,
      easy_result: viewEasyResult,
      expert_region: viewExpertRegion,
      expert_mode: viewExpertMode,
      expert_question: viewExpertQuestion,
      expert_feedback: viewExpertFeedback,
      expert_result: viewExpertResult,
      collection: viewCollection,
      break: viewBreak,
    }[state.screen] || viewHome;
    try { fn(); } catch (e) {
      clearTimers();
      state = freshState();
      saveState();
      viewHome();
    }
    // ⚙️ 길게 누르기 등록
    const gear = document.querySelector('.gear-btn');
    if (gear) holdable(gear, C.SETTINGS_HOLD_MS, openSettings);
  }

  // ── S0 홈 ─────────────────────────────────────────────────────────────
  function viewHome() {
    const total = countries.length;
    const got = collection.length;
    app.innerHTML = `
      <section class="screen home">
        <h1 class="home-title">🌍 국기 놀이</h1>
        <div class="home-btns">
          <button class="btn-mode" id="btn-easy">
            <span class="em">🐣</span>
            <span>쉬운 놀이<br><small>이름 보고 국기 찾기 (소리도 나와요)</small></span>
          </button>
          <button class="btn-mode" id="btn-expert">
            <span class="em">🌟</span>
            <span>국기 박사 도전<br><small>글자로 풀어요</small></span>
          </button>
          <button class="btn-mode btn-coll" id="btn-coll">
            <span class="em">📖</span>
            <span>국기 도감<br><small class="">모은 국기 ${got}/${total}</small></span>
          </button>
        </div>
        <button class="gear-btn" id="gear" aria-label="설정"><span class="ring" data-progress></span>⚙️</button>
        <div class="status-bar">${esc(statusText())}</div>
        ${!window.isSecureContext ? '<div class="https-warn">⚠️ HTTPS로 열어야 오프라인 가능</div>' : ''}
      </section>`;
    tap(document.getElementById('btn-easy'), () => { unlockAudio(); keepAwake(); startEasy(); });
    tap(document.getElementById('btn-expert'), () => { unlockAudio(); keepAwake(); go('expert_region'); });
    tap(document.getElementById('btn-coll'), () => go('collection'));
    checkOffline();
    let n = 0;
    const t = setInterval(() => { if (++n > 15 || offline.ready) clearInterval(t); else checkOffline(); }, 3000);
    timers.push(t);
  }

  // ── 쉬운 놀이 ─────────────────────────────────────────────────────────
  function startEasy() {
    const q = buildEasyGame();
    if (!q) { goHome(); return; }
    // 첫 번째 문제 앞에 안내 음성
    state = Object.assign({}, state, {
      screen: 'easy_question',
      easyQ: q, easyIdx: 0, easyAnswers: [], easyScore: 0, easyNewCollected: [],
      easyFirstQ: true,
    });
    saveState();
    render();
  }

  function viewEasyQuestion() {
    if (!state.easyQ) { goHome(); return; }
    const { easyQ, easyIdx } = state;
    const item = easyQ[easyIdx];
    if (!item) { goHome(); return; }
    const c = byCode[item.code];
    if (!c) { goHome(); return; }
    const n = C.QUESTIONS_EASY;
    const dots = Array.from({ length: n }, (_, k) =>
      `<i class="${k < easyIdx ? 'done' : k === easyIdx ? 'now' : ''}"></i>`).join('');
    const choiceBtns = item.choices.map((code, k) => {
      const f = flagEmoji(code);
      return `<button class="flag-btn" data-k="${k}" data-code="${esc(code)}">${f}</button>`;
    }).join('');
    app.innerHTML = `
      <section class="screen easy-q">
        <button class="q-back-btn" id="q-back" aria-label="홈으로">🏠</button>
        <div class="easy-progress">
          <span>${easyIdx + 1} / ${n}</span>
          <div class="dots">${dots}</div>
        </div>
        <div class="easy-name">
          ${nameHtml(c.ko, c.en)}
        </div>
        <button class="replay-btn" id="replay">🔊</button>
        <div class="easy-choices" id="choices">${choiceBtns}</div>
        <button class="gear-btn" id="gear" aria-label="설정"><span class="ring" data-progress></span>⚙️</button>
      </section>`;
    // 음성 자동 재생
    if (state.easyFirstQ) {
      playGuideVoice('_ask');
      later(() => playCountryVoice(item.code), 2000);
      state.easyFirstQ = false;
      saveState();
    } else {
      playCountryVoice(item.code);
    }
    tap(document.getElementById('replay'), () => playCountryVoice(item.code));
    tap(document.getElementById('q-back'), () => {
      clearTimers(); stopVoice();
      app.innerHTML = `
        <section class="screen">
          <p style="font-size:clamp(32px,5vmin,50px);font-weight:900;margin:0">그만할까요?</p>
          <div class="result-btns">
            <button class="btn-secondary" id="confirm-yes">🏠 나가기</button>
            <button class="btn-primary" id="confirm-no">▶️ 계속하기</button>
          </div>
        </section>`;
      tap(document.getElementById('confirm-yes'), goHome);
      tap(document.getElementById('confirm-no'), render);
    });
    // 보기 클릭
    app.querySelectorAll('.flag-btn').forEach(btn => {
      btn.addEventListener('pointerup', e => {
        if (now() < guardUntil) return;
        const r = btn.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) answerEasy(Number(btn.dataset.k));
      });
      btn.addEventListener('click', () => { if (now() < guardUntil) return; answerEasy(Number(btn.dataset.k)); });
    });
  }

  function answerEasy(k) {
    if (state.screen !== 'easy_question') return;
    const item = state.easyQ[state.easyIdx];
    const chosen = item.choices[k];
    const correct = chosen === item.code;
    if (correct) {
      state.easyScore++;
      const isNew = !collection.includes(item.code);
      addToCollection(item.code);
      if (isNew) state.easyNewCollected.push(item.code);
    }
    state.easyAnswers = state.easyAnswers.concat([{ code: item.code, chosen, correct }]);
    sfx(correct ? 'ok' : 'ng');
    go('easy_feedback');
  }

  function viewEasyFeedback() {
    if (!state.easyQ) { goHome(); return; }
    const last = state.easyAnswers[state.easyAnswers.length - 1];
    if (!last) { goHome(); return; }
    const { correct, code, chosen } = last;
    const c = byCode[code];
    const ms = correct ? C.FEEDBACK_OK_MS : C.FEEDBACK_WRONG_MS;
    const chosenFlag = flagEmoji(chosen);
    const correctFlag = flagEmoji(code);
    const chosenCountry = byCode[chosen];
    app.innerHTML = `
      <section class="screen easy-fb">
        <div class="fb-icon">${correct ? '⭕' : '🤔'}</div>
        <p class="fb-word ${correct ? 'ok' : 'ng'}">${correct ? '딩동댕!' : '괜찮아요!'}</p>
        <div class="fb-country">
          <span class="flag-em" style="font-size:clamp(60px,10vmin,100px)">${correctFlag}</span>
          ${nameHtml(c ? c.ko : code, c ? c.en : code)}
          ${!correct && chosen !== code && chosenCountry ? `<p class="fb-chosen">내가 고른 국기: ${chosenFlag} ${esc(chosenCountry.ko)}</p>` : ''}
        </div>
        <p class="fb-hint">화면을 누르면 ${state.easyIdx + 1 < state.easyQ.length ? '다음' : '결과 보기'}</p>
        <div class="timebar"><i style="animation-duration:${ms}ms"></i></div>
      </section>`;
    if (correct) {
      playGuideVoice('_ok');
    } else {
      later(() => playCountryVoice(code), 400);
    }
    const shown = now();
    later(nextEasy, ms);
    app.querySelector('.screen').addEventListener('click', () => {
      if (now() - shown >= C.TAP_ADVANCE_AFTER_MS) nextEasy();
    });
  }

  function nextEasy() {
    if (state.screen !== 'easy_feedback') return;
    const idx = state.easyIdx + 1;
    if (idx < state.easyQ.length) { go('easy_question', { easyIdx: idx }); }
    else {
      state.easyRoundsSinceBreak = (state.easyRoundsSinceBreak || 0) + 1;
      go('easy_result');
      // _done 음성: render() → stopVoice() 이후 viewEasyResult에서 재생
    }
  }

  function viewEasyResult() {
    const score = state.easyScore || 0;
    const max = state.easyQ ? state.easyQ.length : C.QUESTIONS_EASY;
    const nc = state.easyNewCollected ? state.easyNewCollected.length : 0;
    const stars = '⭐'.repeat(score); // 빈 별 숨김 — 얻은 별만 표시
    const msg = score === max ? '국기 짱! 🎉' : score >= 3 ? '잘했어요! 👍' : '끝까지 했어요! 👏';
    app.innerHTML = `
      <section class="screen">
        <div class="result-stars">${stars || '<span style="font-size:clamp(44px,7vmin,64px)">🌱</span>'}</div>
        <p class="result-msg">${msg}</p>
        <p class="result-score"><b>${score}</b> / ${max} 맞혔어요!</p>
        ${nc > 0 ? `<p class="result-collected">도감에 ${nc}개 새로 모았어요! 📖</p>` : ''}
        <div class="result-btns">
          <button class="btn-primary" id="btn-again">또 하기 🔄</button>
          <button class="btn-secondary" id="btn-home">처음으로 🏠</button>
        </div>
      </section>`;
    if (score === max) sfx('win'); else sfx('ok');
    playGuideVoice('_done'); // render() 이후이므로 stopVoice() 위험 없음
    tap(document.getElementById('btn-again'), () => maybeBreak(() => startEasy()));
    tap(document.getElementById('btn-home'), () => maybeBreak(goHome)); // 카운터 초기화 제거
  }

  // ── 국기 박사 ─────────────────────────────────────────────────────────
  function viewExpertRegion() {
    const regionList = ['all', ...FD.regions];
    const btns = regionList.map(r => {
      const cnt = r === 'all' ? countries.length : countries.filter(c => c.region === r).length;
      const got = r === 'all' ? collection.length : countries.filter(c => c.region === r && collection.includes(c.code)).length;
      return `<button class="btn-region" data-r="${esc(r)}">${regionLabel(r)}<small>${got}/${cnt}</small></button>`;
    }).join('');
    app.innerHTML = `
      <section class="screen">
        <h2 class="expert-title">🌟 국기 박사</h2>
        <p style="font-size:clamp(26px,4vmin,38px);font-weight:800;margin:0;color:var(--muted)">어느 지역 국기를 풀까요?</p>
        <div class="region-grid">${btns}</div>
        <button class="btn-secondary" id="btn-back" style="min-width:min(50vw,320px)">← 돌아가기</button>
        <button class="gear-btn" id="gear" aria-label="설정"><span class="ring" data-progress></span>⚙️</button>
      </section>`;
    app.querySelectorAll('.btn-region').forEach(b => tap(b, () => go('expert_mode', { expertRegion: b.dataset.r })));
    tap(document.getElementById('btn-back'), goHome);
  }

  function viewExpertMode() {
    app.innerHTML = `
      <section class="screen">
        <h2 class="expert-title">🌟 국기 박사</h2>
        <p style="font-size:clamp(26px,4vmin,38px);font-weight:800;margin:0;color:var(--muted)">어떻게 풀까요?</p>
        <div class="mode-btns">
          <button class="btn-mode-expert" id="m-f2n"><span class="em">🏳️</span>국기 보고 이름 고르기</button>
          <button class="btn-mode-expert" id="m-n2f"><span class="em">📝</span>이름 보고 국기 고르기</button>
        </div>
        <button class="btn-secondary" id="btn-back" style="min-width:min(50vw,320px)">← 지역 다시 고르기</button>
        <button class="gear-btn" id="gear" aria-label="설정"><span class="ring" data-progress></span>⚙️</button>
      </section>`;
    tap(document.getElementById('m-f2n'), () => startExpert('flag2name'));
    tap(document.getElementById('m-n2f'), () => startExpert('name2flag'));
    tap(document.getElementById('btn-back'), () => go('expert_region'));
  }

  function startExpert(mode) {
    const q = buildExpertGame(state.expertRegion || 'all', mode);
    if (!q) { go('expert_region'); return; }
    state = Object.assign({}, state, {
      screen: 'expert_question',
      expertMode: mode, expertQ: q, expertIdx: 0, expertAnswers: [], expertScore: 0, expertNewCollected: [],
    });
    saveState();
    render();
  }

  function viewExpertQuestion() {
    if (!state.expertQ) { goHome(); return; }
    const { expertQ, expertIdx, expertMode } = state;
    const item = expertQ[expertIdx];
    if (!item) { goHome(); return; }
    const c = byCode[item.code];
    if (!c) { goHome(); return; }
    const n = expertQ.length;
    const dots = Array.from({ length: n }, (_, k) =>
      `<i class="${k < expertIdx ? 'done' : k === expertIdx ? 'now' : ''}"></i>`).join('');
    let questionHtml, choicesHtml;
    if (expertMode === 'flag2name') {
      // 국기 보여 주기 → 이름 고르기
      questionHtml = `<div class="q-flag">${flagEmoji(item.code)}</div>`;
      choicesHtml = item.choices.map((code, k) => {
        const cc = byCode[code];
        return `<button class="expert-name-btn" data-k="${k}" data-code="${esc(code)}">${nameHtml(cc ? cc.ko : code, cc ? cc.en : code)}</button>`;
      }).join('');
    } else {
      // 이름 보여 주기 → 국기 고르기
      questionHtml = `<div class="q-name">${nameHtml(c.ko, c.en)}</div>`;
      choicesHtml = item.choices.map((code, k) => {
        return `<button class="expert-flag-btn" data-k="${k}" data-code="${esc(code)}">${flagEmoji(code)}</button>`;
      }).join('');
    }
    app.innerHTML = `
      <section class="screen expert-q">
        <button class="q-back-btn" id="q-back" aria-label="홈으로">🏠</button>
        <div class="expert-progress">
          <span>${expertIdx + 1} / ${n}</span>
          <div class="dots">${dots}</div>
          <span class="expert-region-label">${regionLabel(state.expertRegion || 'all')}</span>
        </div>
        ${questionHtml}
        <div class="expert-choices">${choicesHtml}</div>
        <button class="gear-btn" id="gear" aria-label="설정"><span class="ring" data-progress></span>⚙️</button>
      </section>`;
    if (expertMode === 'name2flag' && settings.sound) {
      playCountryVoice(item.code);
    }
    tap(document.getElementById('q-back'), () => {
      clearTimers(); stopVoice();
      app.innerHTML = `
        <section class="screen">
          <p style="font-size:clamp(32px,5vmin,50px);font-weight:900;margin:0">그만할까요?</p>
          <div class="result-btns">
            <button class="btn-secondary" id="confirm-yes">🏠 나가기</button>
            <button class="btn-primary" id="confirm-no">▶️ 계속하기</button>
          </div>
        </section>`;
      tap(document.getElementById('confirm-yes'), goHome);
      tap(document.getElementById('confirm-no'), render);
    });
    const btnClass = expertMode === 'flag2name' ? '.expert-name-btn' : '.expert-flag-btn';
    app.querySelectorAll(btnClass).forEach(btn => {
      btn.addEventListener('pointerup', e => {
        if (now() < guardUntil) return;
        const r = btn.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) answerExpert(Number(btn.dataset.k));
      });
      btn.addEventListener('click', () => { if (now() < guardUntil) return; answerExpert(Number(btn.dataset.k)); });
    });
  }

  function answerExpert(k) {
    if (state.screen !== 'expert_question') return;
    const item = state.expertQ[state.expertIdx];
    const chosen = item.choices[k];
    const correct = chosen === item.code;
    if (correct) {
      state.expertScore++;
      const isNew = !collection.includes(item.code);
      addToCollection(item.code);
      if (isNew) state.expertNewCollected.push(item.code);
    }
    state.expertAnswers = state.expertAnswers.concat([{ code: item.code, chosen, correct }]);
    sfx(correct ? 'ok' : 'ng');
    go('expert_feedback');
  }

  function viewExpertFeedback() {
    if (!state.expertQ) { goHome(); return; }
    const last = state.expertAnswers[state.expertAnswers.length - 1];
    if (!last) { goHome(); return; }
    const { correct, code } = last;
    const c = byCode[code];
    app.innerHTML = `
      <section class="screen expert-fb">
        <div class="fb-icon" style="font-size:clamp(80px,13vmin,120px)">${correct ? '⭕' : '❌'}</div>
        <p class="fb-word ${correct ? 'ok' : 'ng'}" style="margin:0">${correct ? '정답!' : '아쉬워요!'}</p>
        <div class="expert-fb-country">
          <span class="flag-em">${flagEmoji(code)}</span>
          ${nameHtml(c ? c.ko : code, c ? c.en : code, 'name-ko', 'name-en')}
          <span class="region-label">${regionLabel(c ? c.region : '')}</span>
        </div>
        <p class="fb-hint">화면을 누르면 ${state.expertIdx + 1 < state.expertQ.length ? '다음' : '결과 보기'}</p>
        <div class="timebar"><i style="animation-duration:${C.FEEDBACK_EXPERT_MS}ms"></i></div>
      </section>`;
    playCountryVoice(code);
    const shown = now();
    later(nextExpert, C.FEEDBACK_EXPERT_MS);
    app.querySelector('.screen').addEventListener('click', () => {
      if (now() - shown >= C.TAP_ADVANCE_AFTER_MS) nextExpert();
    });
  }

  function nextExpert() {
    if (state.screen !== 'expert_feedback') return;
    const idx = state.expertIdx + 1;
    if (idx < state.expertQ.length) { go('expert_question', { expertIdx: idx }); }
    else { go('expert_result'); }
  }

  function viewExpertResult() {
    const score = state.expertScore || 0;
    const max = state.expertQ ? state.expertQ.length : C.QUESTIONS_EXPERT;
    const nc = state.expertNewCollected ? state.expertNewCollected.length : 0;
    const stars = '⭐'.repeat(score) + '<span class="off">' + '☆'.repeat(Math.max(0, max - score)) + '</span>';
    app.innerHTML = `
      <section class="screen">
        <div class="result-stars">${stars}</div>
        <p class="result-score"><b>${score}</b> / ${max} 정답!</p>
        ${nc > 0 ? `<p class="result-collected">새로 모은 국기 ${nc}개! 📖</p>` : ''}
        <div class="result-btns">
          <button class="btn-primary" id="btn-again">다시 도전 🔄</button>
          <button class="btn-secondary" id="btn-home">처음으로 🏠</button>
        </div>
      </section>`;
    if (score === max) sfx('win');
    tap(document.getElementById('btn-again'), () => go('expert_region'));
    tap(document.getElementById('btn-home'), goHome);
  }

  // ── 도감 ─────────────────────────────────────────────────────────────
  function viewCollection() {
    const regionOrder = FD.regions;
    let sectionsHtml = '';
    for (const region of regionOrder) {
      const regionCountries = countries.filter(c => c.region === region);
      if (!regionCountries.length) continue;
      const got = regionCountries.filter(c => collection.includes(c.code)).length;
      const pct = regionCountries.length > 0 ? (got / regionCountries.length * 100).toFixed(0) : 0;
      const items = regionCountries.map(c => {
        const seen = collection.includes(c.code);
        return `<div class="coll-item ${seen ? '' : 'unseen'}" data-code="${esc(c.code)}" role="button">
          <span class="ci-flag">${flagEmoji(c.code)}</span>
          <span class="ci-name-ko">${esc(seen ? c.ko : '')}</span>
          <span class="ci-name-en">${esc(seen ? c.en : '')}</span>
        </div>`;
      }).join('');
      sectionsHtml += `
        <div class="region-section">
          <div class="region-heading">${regionLabel(region)}<span class="region-count">${got}/${regionCountries.length}</span>
            <div class="region-progress-bar"><i style="width:${pct}%"></i></div>
          </div>
          <div class="coll-grid">${items}</div>
        </div>`;
    }
    app.innerHTML = `
      <section class="screen collection">
        <div class="coll-header">
          <button class="btn-back" id="btn-back">←</button>
          <h2 class="coll-title">📖 국기 도감 ${collection.length}/${countries.length}</h2>
        </div>
        <div class="coll-scroll" id="coll-scroll">${sectionsHtml}</div>
      </section>`;
    tap(document.getElementById('btn-back'), goHome);
    app.querySelectorAll('.coll-item:not(.unseen)').forEach(item => {
      tap(item, () => openCollCard(item.dataset.code));
    });
  }

  function openCollCard(code) {
    const c = byCode[code];
    if (!c) return;
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="card-panel">
        <div class="card-flag">${flagEmoji(code)}</div>
        <p class="card-name-ko">${esc(c.ko)}</p>
        <p class="card-name-en">${esc(c.en)}</p>
        <span class="card-region">${regionLabel(c.region)}</span>
        <div class="card-btns">
          <button class="card-sound-btn" id="card-sound">🔊</button>
          <button class="card-close-btn" id="card-close">닫기</button>
        </div>
      </div>`;
    playCountryVoice(code);
    tap(document.getElementById('card-sound'), () => playCountryVoice(code));
    tap(document.getElementById('card-close'), () => { overlay.hidden = true; overlay.innerHTML = ''; stopVoice(); });
    function onOverlayClick(e) {
      if (e.target === overlay) {
        overlay.removeEventListener('click', onOverlayClick);
        overlay.hidden = true; overlay.innerHTML = ''; stopVoice();
      }
    }
    guardUntil = now() + C.INPUT_GUARD_MS;
    overlay.addEventListener('click', onOverlayClick);
  }

  // ── 쉬는 시간 ───────────────────────────────────────────────────────────
  function viewBreak() {
    app.innerHTML = `
      <section class="screen break-screen">
        <div class="break-icon">👀</div>
        <h2 class="break-title">눈 쉬어 가요</h2>
        <p class="break-desc">잠깐 멀리 봐요! 🌿</p>
        <button class="break-hold-btn" id="break-btn"><span class="fill" data-progress></span><span>부모님이 2초 눌러 계속</span></button>
      </section>`;
    playGuideVoice('_rest');
    holdable(document.getElementById('break-btn'), C.BREAK_CONTINUE_HOLD_MS, () => {
      state.easyRoundsSinceBreak = 0;
      saveState();
      const dest = state.afterBreak;
      const cb = state._afterBreakCb;
      if (dest === 'home_callback' && typeof cb === 'function') {
        state._afterBreakCb = null;
        saveState();
        cb();
      } else {
        goHome();
      }
    });
  }

  // ── 부모 설정 오버레이 ────────────────────────────────────────────────────
  function openSettings() {
    let resetArmed = false;
    const draw = () => {
      const ba = settings.breakAfter;
      overlay.hidden = false;
      overlay.innerHTML = `
        <div class="panel">
          <h2>⚙️ 설정</h2>
          <div class="section-label">소리</div>
          <div class="panel-row">
            <button class="toggle-btn ${settings.sound ? 'on' : ''}" id="s-sound">소리 ${settings.sound ? '켜짐' : '꺼짐'}</button>
          </div>
          <div class="section-label">쉬는 시간 (쉬운 놀이)</div>
          <div class="panel-row">
            <button class="toggle-btn ${ba === 0 ? 'on' : ''}" data-ba="0">끄기</button>
            <button class="toggle-btn ${ba === 3 ? 'on' : ''}" data-ba="3">3판마다</button>
            <button class="toggle-btn ${ba === 5 ? 'on' : ''}" data-ba="5">5판마다</button>
          </div>
          <div class="section-label">도감 초기화</div>
          <div class="panel-row">
            <button class="warn ${resetArmed ? 'armed' : ''}" id="s-reset">${resetArmed ? '한 번 더 누르면 초기화' : '도감 초기화'}</button>
          </div>
          <div class="info">${esc(statusText())}</div>
          <button class="close-btn" id="s-close">닫기</button>
        </div>`;
      document.getElementById('s-sound').onclick = () => { settings.sound = !settings.sound; saveSettings(); resetArmed = false; draw(); };
      document.querySelectorAll('[data-ba]').forEach(b => {
        b.onclick = () => { settings.breakAfter = Number(b.dataset.ba); saveSettings(); resetArmed = false; draw(); };
      });
      document.getElementById('s-reset').onclick = () => {
        if (!resetArmed) { resetArmed = true; draw(); return; }
        collection = []; saveCollection(); resetArmed = false; draw();
      };
      document.getElementById('s-close').onclick = () => { overlay.hidden = true; overlay.innerHTML = ''; render(); };
    };
    draw();
  }

  render();
})();
