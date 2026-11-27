// 골고 폼 화면. 영상 받기(고르기·공유) → 두 번 훑기 → 엔진 → 결과 → 폰 저장.

import * as S from './store.js';
import { mp4Info } from './mp4info.js';
import { Scanner, grid, denseTimes } from './scan.js';
import { analyze, ENGINE_VER } from './engine/index.js';
import { AXES } from './engine/score.js';

const APP_VER = '0.1.0';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEF_SET = { pose: 'full', ball: 'efficientdet_lite0', delegate: 'GPU', width: 960, step: 30 };
const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
const VIEW_KO = { front: '정면', back: '뒤', side: '옆', diag: '비스듬', unknown: '알 수 없음' };
const AXIS_KO = Object.fromEntries(AXES);

let profile = null, settings = null, criteria = null, scanner = null, installEvt = null;

// ── 화면 전환(안드로이드 뒤로 가기 버튼도 되게 history 사용)
const VIEWS = ['setup', 'home', 'run', 'result', 'settings'];
function show(v, title = '골고 폼', push = true) {
  for (const x of VIEWS) $('v-' + x).hidden = x !== v;
  $('title').textContent = title;
  $('back').hidden = v === 'home' || v === 'setup' || v === 'run';
  $('gear').hidden = v !== 'home';
  if (push && v !== 'home') history.pushState({ v }, '');
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (!$('v-run').hidden) { history.pushState({ v: 'run' }, ''); return; } goHome(false); });
$('back').onclick = () => history.back();

function toast(t, ms = 2600) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => e.hidden = true, ms); }
const fmtT = s => { const m = Math.floor(s / 60), r = s - m * 60; return m ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(1)}초`; };
const dateKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function segPick(el, val) { for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === val); el.onclick = e => { const b = e.target.closest('button'); if (b) segPick(el, b.dataset.v); }; }
const segVal = el => el.querySelector('button.on')?.dataset.v;

// ── 시작
async function boot() {
  $('ver').textContent = `골고 폼 ${APP_VER} · 엔진 ${ENGINE_VER}`;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(() => { });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
  [profile, settings] = await Promise.all([S.kvGet('profile'), S.kvGet('settings')]);
  settings = { ...DEF_SET, ...(settings || {}) };
  criteria = { dribble: await (await fetch('criteria/dribble.json', { cache: 'no-cache' })).json() };
  if (!profile) { segPick($('footSeg'), 'r'); show('setup', '골고 폼', false); return; }
  goHome(false);
  const shared = new URLSearchParams(location.search).get('shared');
  if (shared) { history.replaceState(null, '', location.pathname); const items = await S.inboxAll(); if (items.length === 1) startFromInbox(items[0]); }
}

$('saveSetup').onclick = async () => {
  const h = +$('height').value;
  if (!(h >= 120 && h <= 220)) { toast('키를 cm 로 넣어 주세요(120~220)'); return; }
  profile = { heightCm: h, foot: segVal($('footSeg')) || 'r', createdMs: Date.now() };
  await S.kvSet('profile', profile); S.persist();
  goHome(false);
};

async function goHome(push = true) {
  show('home', '골고 폼', push);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('installTip').hidden = !!standalone;
  // 공유로 받은 영상
  const inbox = await S.inboxAll();
  $('inbox').innerHTML = inbox.length ? `<h3 class="h3">받은 영상 ${inbox.length}개</h3>` + inbox.map(it => `
    <button class="item" data-in="${it.id}"><span class="k"><b>${esc(it.name)}</b><span class="sub">${(it.blob.size / 1048576).toFixed(0)}MB · 눌러서 분석</span></span><span class="s">▶</span></button>`).join('') : '';
  for (const b of $('inbox').querySelectorAll('[data-in]')) b.onclick = () => startFromInbox(inbox.find(x => x.id === +b.dataset.in));
  // 기록(레슨 날짜별)
  const list = (await S.resList()).reverse();
  if (!list.length) { $('history').innerHTML = '<p class="sub empty">아직 분석한 영상이 없어요.</p>'; return; }
  let html = '', day = '';
  for (const r of list) {
    if (r.lesson !== day) { day = r.lesson; html += `<div class="day">${esc(day)}</div>`; }
    const segs = r.result.segs;
    const top = segs.length ? Math.max(...segs.map(s => s.total ?? -1)) : null;
    html += `<button class="item" data-id="${esc(r.id)}"><span class="k"><b>${esc(r.name)}</b><span class="sub">${hhmm(r.takenAt)} · ${segs.length ? `드리블 ${segs.length}회` : '동작을 찾지 못함'} · ${VIEW_KO[r.result.view.view]}</span></span>
      <span class="s">${top != null && top >= 0 ? top : '—'}<small>점</small></span></button>`;
  }
  $('history').innerHTML = html;
  for (const b of $('history').querySelectorAll('[data-id]')) b.onclick = async () => openResult(await S.resGet(b.dataset.id));
}

$('file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) startAnalysis(f, f.name, null); };
async function startFromInbox(it) { if (it) startAnalysis(it.blob, it.name, it.id, it.lastModified); }
$('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').hidden = true; };

// ── 분석
const video = document.createElement('video');
video.muted = true; video.playsInline = true; video.preload = 'auto';
// 화면 구조에 붙어 있어야 장면을 제대로 그린다. 거의 안 보이게.
video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
document.body.appendChild(video);

$('stopRun').onclick = () => { if (scanner) scanner.stop = true; };

async function startAnalysis(blob, name, inboxId, lastMod) {
  show('run', '분석 중');
  $('runName').textContent = name; $('prog').style.width = '0%';
  const say = t => $('stat').textContent = t;
  const url = URL.createObjectURL(blob);
  try {
    say('영상 읽는 중…');
    video.src = url;
    await new Promise((ok, bad) => { video.onloadedmetadata = ok; video.onerror = () => bad(new Error('이 영상을 열 수 없어요(형식이 맞지 않을 수 있음)')); });
    const info = await mp4Info(blob).catch(() => null) || {};
    const srcFps = info.mainFps && isFinite(info.mainFps) ? info.mainFps : 30;
    const dur = video.duration;
    const takenAt = info.createdMs || lastMod || blob.lastModified || Date.now();
    const notes = [];
    if (info.mixed) notes.push(`장면 간격이 섞인 영상이에요(슬로모션 구간이 있을 수 있음, 가장 촘촘한 곳 ${Math.round(info.maxFps)}fps). 시간 지표는 확인이 필요해요.`);

    scanner = new Scanner(video, $('cv'), settings);
    await scanner.init(say);
    if (scanner.m.delegate !== settings.delegate) notes.push('그래픽(GPU) 계산이 안 돼 CPU 로 분석했어요.');
    const step = Math.min(+settings.step, srcFps);
    const ctx = $('cv').getContext('2d');
    const t0 = performance.now();
    const onFrame = (base, span) => async (f, p) => {
      $('prog').style.width = (100 * (base + p * span)).toFixed(0) + '%';
      drawPose(ctx, f, 1);
      const el = (performance.now() - t0) / 1000;
      say(`${Math.round(100 * (base + p * span))}% · 영상 ${fmtT(f.t)} / ${fmtT(dur)} · ${el.toFixed(0)}초 지남`);
      await new Promise(r => setTimeout(r, 0));
    };
    const dense = srcFps > step * 1.5;
    let raw = await scanner.scanTimes(grid(0, dur - 0.001, step), onFrame(0, dense ? 0.7 : 0.95));
    if (scanner.stop) throw new Error('멈췄어요');
    const past = (await S.resList()).filter(r => r.takenAt < takenAt).map(r => r.result);
    let result = analyze(raw, { heightCm: profile.heightCm, fps: srcFps, criteria, history: past });
    // 2차: 슬로모션이면 터치·임팩트 앞뒤만 모든 장면
    if (dense && !scanner.stop) {
      const evT = [...result.events.touches, ...result.events.impacts].map(e => e.t);
      const more = denseTimes(evT, srcFps, dur, raw.map(f => f.t));
      if (more.length) {
        say(`사건 ${evT.length}곳 앞뒤를 촘촘히 다시 보는 중…`);
        const add = await scanner.scanTimes(more, onFrame(0.7, 0.25));
        raw = [...raw, ...add].sort((a, b) => a.t - b.t);
        result = analyze(raw, { heightCm: profile.heightCm, fps: srcFps, criteria, history: past });
      }
    }
    say('장면 사진 만드는 중…');
    const shots = await makeShots(raw, result);
    scanner.close();
    result.notes = [...notes, ...result.calib.notes];
    result.scan = { srcFps: +srcFps.toFixed(2), step, frames: raw.length, wallSec: +((performance.now() - t0) / 1000).toFixed(1), w: video.videoWidth, h: video.videoHeight, set: { ...settings, delegate: scanner.m.delegate }, mp4: info };
    const rec = {
      id: `v_${takenAt}_${blob.size}`, name, size: blob.size, takenAt, lesson: dateKey(takenAt), analyzedAt: Date.now(),
      appVer: APP_VER, result, rawGz: await S.gz(raw), shots,
    };
    await S.resPut(rec);
    if (inboxId != null) await S.inboxDel(inboxId);
    S.persist();
    history.replaceState(null, '');
    openResult(rec, false);
  } catch (e) {
    if (scanner) scanner.close();
    say((e && e.message) || String(e));
    $('stopRun').textContent = '처음으로';
    $('stopRun').onclick = () => { $('stopRun').textContent = '멈추기'; $('stopRun').onclick = () => { if (scanner) scanner.stop = true; }; goHome(false); };
  } finally {
    URL.revokeObjectURL(url); video.removeAttribute('src'); video.load();
  }
}

function drawPose(ctx, f, scale) {
  const W = ctx.canvas.width;
  ctx.lineWidth = Math.max(2, W / 300);
  if (f.kp) {
    ctx.strokeStyle = '#3ddc97';
    for (const [a, b] of EDGES) { const p = f.kp[a], q = f.kp[b]; if (p[2] < .5 || q[2] < .5) continue; ctx.beginPath(); ctx.moveTo(p[0] * scale, p[1] * scale); ctx.lineTo(q[0] * scale, q[1] * scale); ctx.stroke(); }
    for (const [i, c] of [[31, '#5aa9ff'], [32, '#ff8a3d']]) { const p = f.kp[i]; if (p[2] < .5) continue; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0] * scale, p[1] * scale, ctx.lineWidth * 2, 0, 7); ctx.fill(); }
  }
  if (f.ball) { ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.arc(f.ball.x * scale, f.ball.y * scale, f.ball.r * scale, 0, 7); ctx.stroke(); }
}

// 장면 사진: 드리블 구간마다 터치 몇 개(처음·가운데·끝) + 방향 전환 하나. 영상이 없어도 장면을 볼 수 있게 JPEG 로 남긴다.
async function makeShots(raw, result) {
  const want = [];
  for (const [k, s] of result.segs.entries()) {
    const tc = s.touches; if (!tc.length) continue;
    const pick = [...new Set([0, Math.floor(tc.length / 2), tc.length - 1])].map(i => tc[i]);
    for (const t of pick) want.push({ t: t.t, cap: `${k + 1}회 터치(${t.foot === 'l' ? '왼발' : t.foot === 'r' ? '오른발' : '?'}) ${fmtT(t.t)}` });
  }
  if (!want.length) for (const t of result.events.touches.slice(0, 4)) want.push({ t: t.t, cap: `터치 ${fmtT(t.t)}` });
  const out = [], W = 480, cv = document.createElement('canvas');
  cv.width = W; cv.height = Math.round(W * video.videoHeight / video.videoWidth);
  const ctx = cv.getContext('2d'), sc = W / scanner.W;
  for (const w of want.slice(0, 8)) {
    await new Promise(ok => { const h = () => { video.removeEventListener('seeked', h); ok(); }; video.addEventListener('seeked', h); video.currentTime = w.t; });
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const f = raw.reduce((a, b) => Math.abs(b.t - w.t) < Math.abs(a.t - w.t) ? b : a);
    drawPose(ctx, f, sc);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.72));
    if (blob) out.push({ t: w.t, cap: w.cap, blob });
  }
  return out;
}

// ── 결과
let shotUrls = [];
function openResult(rec, push = true) {
  if (!rec) return;
  show('result', rec.name, push);
  shotUrls.forEach(URL.revokeObjectURL); shotUrls = [];
  const r = rec.result, el = $('v-result');
  const sc = r.scan || {};
  let h = `<div class="card"><div class="sub">${esc(rec.lesson)} ${hhmm(rec.takenAt)} · ${fmtT(r.dur)} · ${sc.srcFps ? Math.round(sc.srcFps) + 'fps' : ''} · 찍은 방향 ${VIEW_KO[r.view.view]}</div>`;
  if (!r.segs.length) {
    h += `<h2 style="margin-top:8px">드리블 구간을 찾지 못했어요</h2>
      <p class="sub">지금 판은 드리블만 알아봐요(슈팅·패스 등은 다음 판). 터치 ${r.events.touches.length}번, 자세를 찾은 장면 ${Math.round(r.poseSeen * 100)}%, 공을 찾은 장면 ${Math.round(r.ballSeen * 100)}%.</p>
      ${r.ballSeen < 0.5 ? '<div class="note">공이 잘 안 잡혔어요. 공이 화면에서 너무 작거나(멀리서 찍음) 가려졌을 수 있어요. 지금 공 찾기는 일반 모델이라 축구공 전용 모델로 바꾸면 나아질 거예요.</div>' : ''}
      ${r.poseSeen < 0.6 ? '<div class="note">몸이 잘 안 잡혔어요. 몸 전체가 화면에 들어오게 찍어 주세요.</div>' : ''}`;
  }
  h += '</div>';
  r.segs.forEach((s, k) => { h += segCard(s, k, r); });
  // 시간 띠: 터치(왼·오른) + 드리블 구간
  if (r.dur > 0) {
    const pc = t => (100 * t / r.dur).toFixed(2);
    h += `<div class="card"><h2>사건 시간 띠</h2><div class="tl">` +
      r.segs.map(s => `<span class="seg" style="left:${pc(s.t0)}%;width:${pc(s.t1 - s.t0)}%"></span>`).join('') +
      r.events.touches.map(t => `<i class="${t.foot || 'u'}" style="left:${pc(t.t)}%"></i>`).join('') +
      `</div><div class="legend">터치 <b class="l">■ 왼발</b> <b class="r">■ 오른발</b> · 초록 띠 = 드리블 구간 · 걸음 ${r.events.steps.length} · 방향 전환 ${r.events.cuts.length}</div></div>`;
  }
  if (rec.shots && rec.shots.length) {
    h += `<div class="card"><h2>장면</h2><div class="shots">` + rec.shots.map(s => { const u = URL.createObjectURL(s.blob); shotUrls.push(u); return `<figure><img src="${u}" alt=""><figcaption>${esc(s.cap)}</figcaption></figure>`; }).join('') + `</div></div>`;
  }
  const notes = r.notes || [];
  if (notes.length) h += `<div class="card"><h2>알림</h2>${notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}</div>`;
  h += `<div class="card"><details><summary>분석 정보</summary><table>
    <tr><td>장면</td><td class="v">${r.frames}장 (${sc.step ?? '—'}장/초로 1차)</td></tr>
    <tr><td>걸린 시간</td><td class="v">${sc.wallSec ?? '—'}초</td></tr>
    <tr><td>자세·공을 찾은 장면</td><td class="v">${Math.round(r.poseSeen * 100)}% · ${Math.round(r.ballSeen * 100)}%</td></tr>
    <tr><td>키로 맞춘 크기</td><td class="v">${r.calib.byHeight ? `화면 속 키 ${r.calib.byHeight.standPx}px` : '—'}</td></tr>
    <tr><td>공으로 잰 키</td><td class="v">${r.calib.byBall?.heightCm ? r.calib.byBall.heightCm + 'cm' : '—'}</td></tr>
    <tr><td>좌우 뒤바뀜 바로잡음</td><td class="v">${r.swaps}번</td></tr>
    <tr><td>모델</td><td class="v">${esc(sc.set ? `${sc.set.pose} · ${sc.set.delegate} · ${sc.set.width}px` : '—')}</td></tr>
    <tr><td>엔진 · 기준표</td><td class="v">${esc(r.engine)} · ${esc(r.criteriaVer)}</td></tr>
    </table></details>
    <div class="row2"><button class="sec" id="reCalc">최신 기준으로 다시 계산</button><button class="sec" id="dl">결과 파일 받기</button></div>
    <button class="sec" id="del" style="color:var(--bad)">이 기록 지우기</button></div>`;
  el.innerHTML = h;
  $('reCalc').onclick = async () => {
    const raw = await S.gunzip(rec.rawGz); if (!raw) return toast('원재료가 없어요');
    criteria = { dribble: await (await fetch('criteria/dribble.json', { cache: 'no-cache' })).json() };
    const past = (await S.resList()).filter(x => x.takenAt < rec.takenAt).map(x => x.result);
    const nr = analyze(raw, { heightCm: profile.heightCm, fps: r.fps, criteria, history: past });
    nr.notes = r.notes; nr.scan = r.scan;
    rec.result = nr; await S.resPut(rec); toast('다시 계산했어요'); openResult(rec, false);
  };
  $('dl').onclick = () => {
    const { rawGz, shots, ...meta } = rec;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' }));
    a.download = `goalgo-form_${rec.lesson}_${hhmm(rec.takenAt).replace(':', '')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('del').onclick = async () => { if (!confirm('이 기록을 지울까요? 갤러리 영상은 그대로 남아요.')) return; await S.resDel(rec.id); history.back(); };
}

function segCard(s, k, r) {
  const ms = s.total;
  let h = `<div class="card"><div class="sub">${k + 1}회 · ${fmtT(s.t0)} ~ ${fmtT(s.t1)} · 터치 ${s.touches.length}번 · ${VIEW_KO[s.view.view]}${s.conf !== 'high' ? ' · <span class="warn">드리블이 맞나요?</span>' : ''}</div>
    <div class="score" style="margin-top:6px"><span class="n">${ms ?? '—'}</span><span>${esc(s.name)} 점수</span></div>
    <div class="sub">${s.axesUsed < 3 ? `세 축 중 ${s.axesUsed}개로 냄(${AXES.filter(([a]) => s.axes[a].score == null).map(([, n]) => n).join('·')}는 기준이 없거나 못 잼)` : ''}</div>
    <div class="axes">` + AXES.map(([a, n]) => { const x = s.axes[a]; return `<div class="axis"><span>${n}</span><span class="t"><i style="width:${x.score ?? 0}%"></i></span><span class="v">${x.score ?? '—'}</span></div>`; }).join('') + `</div>`;
  if (s.fixes.length) h += `<h3 class="h3">고칠 점</h3>` + s.fixes.map(f => `<div class="fix"><b>${esc(f.name)} · ${f.score}점</b>${esc(f.text)}</div>`).join('');
  h += `<h3 class="h3">지표</h3><table>`;
  for (const [a, n] of AXES) {
    for (const x of s.rows.filter(x => x.axis === a)) {
      let v = '—', sub = '';
      if (x.value != null) {
        v = `${x.value}<span class="tag">${esc(x.unit)}</span>`;
        if (x.score != null) sub = `<span class="${x.score >= 80 ? 'ok' : x.score >= 50 ? 'warn' : 'bad'}">${x.score}점</span>`;
        else if (x.delta != null) sub = `<span class="${x.better ? 'ok' : 'warn'}">내 기준 ${x.base} 대비 ${x.delta > 0 ? '+' : ''}${x.delta}</span>`;
        else sub = x.trust === 'ref' ? '참고값' : '개인 비교(기록이 쌓이면)';
      } else sub = esc(x.why || '');
      h += `<tr><td>${esc(x.name)}<span class="tag">${n}</span>${x.note ? `<div class="why">${esc(x.note)}</div>` : ''}</td><td class="v">${v}<div class="why">${sub}</div></td></tr>`;
    }
  }
  return h + `</table></div>`;
}

// ── 설정
$('gear').onclick = async () => {
  show('settings', '설정');
  $('sHeight').value = profile.heightCm; segPick($('sFootSeg'), profile.foot);
  $('sPose').value = settings.pose; $('sWidth').value = settings.width; $('sDelegate').value = settings.delegate; $('sStep').value = settings.step;
  const u = await S.usage();
  $('usage').textContent = u ? `이 앱이 쓰는 공간 ${(u.used / 1048576).toFixed(0)}MB / 쓸 수 있는 공간 약 ${(u.quota / 1073741824).toFixed(0)}GB` : '알 수 없음';
};
$('saveSettings').onclick = async () => {
  const h = +$('sHeight').value;
  if (!(h >= 120 && h <= 220)) { toast('키를 cm 로 넣어 주세요(120~220)'); return; }
  profile = { ...profile, heightCm: h, foot: segVal($('sFootSeg')) };
  settings = { ...settings, pose: $('sPose').value, width: +$('sWidth').value, delegate: $('sDelegate').value, step: +$('sStep').value };
  await Promise.all([S.kvSet('profile', profile), S.kvSet('settings', settings)]);
  toast('저장했어요'); history.back();
};

boot().catch(e => { document.querySelector('main').innerHTML = `<div class="card"><h2>시작하지 못했어요</h2><p class="sub">${esc(e.message || e)}</p></div>`; });
