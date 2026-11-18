'use strict';

const LENGTHS = [3, 4, 5, 6, 7];
const MAX_GUESSES = 6;
const WIN_STEP = 110, WIN_FLIP = 420; // ms: the winning row turns over slowly
const STORE = 'wordguess.v1';
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- saved state ----------
const S = { choice: '5', auto: false, starts: {}, game: null, stats: {}, seen: {} };
try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} };

// ---------- words ----------
const answers = {};
for (const n of LENGTHS) answers[n] = ANSWERS[n].split(' ');

const dicts = {};
async function loadDict(n) {
  if (dicts[n]) return dicts[n];
  try {
    const text = await (await fetch(`dict/${n}.txt`)).text();
    const set = new Set(answers[n]);
    for (let i = 0; i + n <= text.length; i += n) set.add(text.substr(i, n));
    dicts[n] = set;
  } catch (e) {
    return null; // can't check: accept any guess rather than block play
  }
  return dicts[n];
}

// Picks an answer not seen recently (no repeats until the list is used up).
function pickAnswer(n, avoid) {
  const list = answers[n];
  let seen = S.seen[n] || [];
  if (seen.length >= list.length - 1) seen = [];
  const used = new Set(seen);
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (used.has(i) || list[i] === avoid);
  seen.push(i);
  S.seen[n] = seen;
  return list[i];
}

// 'c' right place, 'p' wrong place, 'a' absent. Handles repeated letters.
function score(guess, answer) {
  const out = Array(guess.length).fill('a');
  const left = {};
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) out[i] = 'c';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] !== 'c' && left[guess[i]]) { out[i] = 'p'; left[guess[i]]--; }
  }
  return out;
}

// ---------- rendering ----------
let busy = false;
const board = $('board'), wrap = $('wrap'), kb = $('kb');

function fit() {
  const n = S.game ? S.game.n : 5, gap = 5;
  const w = wrap.clientWidth - 16, h = wrap.clientHeight - 16;
  const size = Math.min((w - gap * (n - 1)) / n, (h - gap * (MAX_GUESSES - 1)) / MAX_GUESSES, 64);
  board.style.setProperty('--tile', Math.max(20, Math.floor(size)) + 'px');
}

function renderBoard(opt = {}) {
  const g = S.game;
  if (!g) { board.innerHTML = ''; return; }
  let html = '';
  for (let r = 0; r < MAX_GUESSES; r++) {
    const done = r < g.guesses.length;
    const active = r === g.guesses.length && !g.done;
    const word = done ? g.guesses[r] : active ? g.cur : '';
    const marks = done ? score(word, g.answer) : null;
    const flip = opt.reveal && r === g.guesses.length - 1;
    const step = flip && g.won ? WIN_STEP : 25;
    html += `<div class="row${active ? ' active' + (opt.shake ? ' shake' : '') : ''}">`;
    for (let i = 0; i < g.n; i++) {
      let cls = 'tile', style = '';
      if (marks) cls += ' ' + marks[i];
      if (flip) { cls += g.won ? ' flip win' : ' flip'; style = ` style="animation-delay:${i * step}ms"`; }
      if (active && opt.pop && i === word.length - 1) cls += ' pop';
      html += `<div class="${cls}"${style}>${word[i] || ''}</div>`;
    }
    html += '</div>';
  }
  board.innerHTML = html;
  fit();
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function buildKeyboard() {
  kb.innerHTML = KEY_ROWS.map((row, i) =>
    `<div class="krow${i === 1 ? ' inset' : i === 2 ? ' wide' : ''}">` +
    [...row].map(k => `<button class="key" data-k="${k}">${k.toUpperCase()}</button>`).join('') +
    '</div>').join('') +
    '<div class="krow"><button class="key" data-k="enter">Enter</button>' +
    '<button class="key" data-k="back">Delete</button></div>';
  // pointerdown (not click) so fast two-thumb typing never drops a letter
  kb.addEventListener('pointerdown', e => {
    const key = e.target.closest('.key');
    if (!key) return;
    e.preventDefault();
    press(key.dataset.k);
  });
}

function renderKeys() {
  const best = {}, rank = { a: 1, p: 2, c: 3 };
  const g = S.game;
  if (g) for (const w of g.guesses) {
    const m = score(w, g.answer);
    for (let i = 0; i < w.length; i++) if (!best[w[i]] || rank[m[i]] > rank[best[w[i]]]) best[w[i]] = m[i];
  }
  for (const key of kb.querySelectorAll('.key')) {
    const k = key.dataset.k;
    key.className = 'key' + (best[k] ? ' ' + best[k] : '');
  }
}

const dResult = $('dResult');
function showResult() {
  const g = S.game;
  if (!g || !g.done || dResult.open) return;
  $('resTitle').textContent = g.won
    ? `Solved in ${g.guesses.length} of ${MAX_GUESSES}`
    : 'Out of guesses. The word was';
  $('resWord').textContent = g.answer;
  $('bShare').textContent = 'Share';
  dResult.showModal();
  placeResult();
}

// Line the popup's top up with the top of the keyboard, so it covers the
// keyboard and leaves the whole board in view (for screenshots).
function placeResult() {
  if (!dResult.open) return;
  const room = window.innerHeight - dResult.offsetHeight - 8;
  const top = Math.max(8, Math.min(kb.getBoundingClientRect().top, room));
  dResult.style.margin = `${Math.round(top)}px auto 0`;
}

function renderAll() {
  renderBoard();
  renderKeys();
  if (S.game && S.game.done) showResult();
  else if (dResult.open) dResult.close();
}

// A short, small burst of confetti from the winning row.
function confetti(row) {
  if (!row || !row.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = row.getBoundingClientRect();
  const colors = ['#2e9e4f', '#e8a317', '#4f8ef7', '#e5484d', '#f4f4f5'];
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    bit.style.left = box.left + Math.random() * box.width + 'px';
    bit.style.top = box.top + box.height / 2 + 'px';
    bit.style.background = colors[i % colors.length];
    document.body.appendChild(bit);
    const dx = (Math.random() - 0.5) * 140, up = 40 + Math.random() * 70, spin = (Math.random() - 0.5) * 900;
    bit.animate([
      { transform: 'translate(0, 0) rotate(0)', opacity: 1, easing: 'ease-out' },
      { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4, easing: 'ease-in' },
      { transform: `translate(${dx}px, ${up * 0.6}px) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 250, delay: Math.random() * 60, fill: 'both' })
      .onfinish = () => bit.remove();
  }
}

let toastTimer;
function toast(msg, ms = 1600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- playing ----------
function press(k) {
  const g = S.game;
  if (!g || busy) return;
  if (g.done) return showResult(); // popup was dismissed: any key brings it back
  if (k === 'enter') return void submit();
  if (k === 'back') {
    if (!g.cur) return;
    g.cur = g.cur.slice(0, -1);
    renderBoard();
  } else if (g.cur.length < g.n) {
    g.cur += k;
    renderBoard({ pop: true });
  } else return;
  save();
}

async function submit() {
  const g = S.game;
  if (!g || g.done || busy) return;
  const reject = msg => { toast(msg); renderBoard({ shake: true }); };
  if (g.cur.length < g.n) return reject('Not enough letters');
  const dict = await loadDict(g.n);
  if (dict && !dict.has(g.cur)) return reject('Not a valid guess');

  const guess = g.cur;
  g.guesses.push(guess);
  g.cur = '';
  if (guess === g.answer) { g.done = true; g.won = true; }
  else if (g.guesses.length >= MAX_GUESSES) g.done = true;
  if (g.done) record(g);
  save();

  busy = true;
  renderBoard({ reveal: true });
  await sleep(g.won ? (g.n - 1) * WIN_STEP + WIN_FLIP : g.n * 25 + 180);
  if (S.game === g) renderKeys();
  if (S.game === g && g.done) {
    if (g.won) confetti(board.children[g.guesses.length - 1]);
    await sleep(g.won ? 750 : 350);
  }
  busy = false;
  if (S.game === g) showResult();
}

function record(g) {
  for (const k of [g.n, 'all']) {
    const st = S.stats[k] || (S.stats[k] = { played: 0, wins: 0, streak: 0, best: 0, dist: {} });
    st.played++;
    if (g.won) {
      st.wins++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
      st.dist[g.guesses.length] = (st.dist[g.guesses.length] || 0) + 1;
    } else st.streak = 0;
  }
}

async function newGame() {
  const n = S.choice === 'rand' ? LENGTHS[Math.floor(Math.random() * LENGTHS.length)] : +S.choice;
  const dict = await loadDict(n);
  let first = S.auto ? S.starts[n] : null;
  if (first && (first.length !== n || (dict && !dict.has(first)))) first = null;

  const g = S.game = { n, answer: pickAnswer(n, first), guesses: [], cur: '', done: false, won: false };
  save();
  renderAll();
  if (!first) return;

  // Play the saved starting word automatically.
  busy = true;
  await sleep(80);
  if (S.game !== g) { busy = false; return; }
  g.cur = first;
  renderBoard();
  await sleep(80);
  busy = false;
  if (S.game === g) submit();
}

// ---------- new game dialog ----------
const dStart = $('dStart'), selLen = $('selLen'), chkAuto = $('chkAuto'), inpAuto = $('inpAuto'), autoNote = $('autoNote');

function note(msg, isError) {
  autoNote.textContent = msg;
  autoNote.classList.toggle('err', !!isError);
}

function syncStartForm() {
  const c = selLen.value, rand = c === 'rand';
  inpAuto.disabled = !chkAuto.checked || rand;
  inpAuto.maxLength = rand ? 7 : +c;
  inpAuto.value = rand ? '' : (S.starts[c] || '');
  inpAuto.placeholder = rand ? '' : `${c}-letter word`;
  note(!chkAuto.checked ? 'Tick the box to have the same first guess played for you every game.'
    : rand ? 'Random uses the word you saved for whichever length comes up.'
    : 'Saved separately for each word length.');
}

function openStart() {
  selLen.value = S.choice;
  chkAuto.checked = S.auto;
  syncStartForm();
  $('bCancel').hidden = !S.game;
  dStart.showModal();
}

selLen.addEventListener('change', syncStartForm);
chkAuto.addEventListener('change', () => {
  syncStartForm();
  if (chkAuto.checked && !inpAuto.disabled && !inpAuto.value) inpAuto.focus();
});
inpAuto.addEventListener('input', () => {
  inpAuto.value = inpAuto.value.toLowerCase().replace(/[^a-z]/g, '');
});
inpAuto.addEventListener('keydown', e => { if (e.key === 'Enter') $('bStart').click(); });
dStart.addEventListener('cancel', e => { if (!S.game) e.preventDefault(); });
$('bCancel').addEventListener('click', () => dStart.close());

$('bStart').addEventListener('click', async () => {
  const c = selLen.value;
  if (chkAuto.checked && c !== 'rand') {
    const n = +c, w = inpAuto.value;
    if (w.length !== n) return note(`Enter a ${n}-letter word.`, true);
    const dict = await loadDict(n);
    if (dict && !dict.has(w)) return note(`${w.toUpperCase()} is not in the word list.`, true);
    S.starts[n] = w;
  }
  S.choice = c;
  S.auto = chkAuto.checked;
  save();
  dStart.close();
  newGame();
});

// ---------- stats dialog ----------
function renderStats() {
  const st = S.stats[$('selStats').value] || { played: 0, wins: 0, streak: 0, best: 0, dist: {} };
  const pct = st.played ? Math.round(100 * st.wins / st.played) : 0;
  $('statNums').innerHTML = [[st.played, 'Played'], [pct, 'Win %'], [st.streak, 'Streak'], [st.best, 'Best streak']]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const max = Math.max(1, ...Object.values(st.dist));
  let html = '';
  for (let i = 1; i <= MAX_GUESSES; i++) {
    const v = st.dist[i] || 0;
    html += `<div class="bar"><span>${i}</span><i class="${v ? 'hit' : ''}" style="width:${Math.round(100 * v / max)}%">${v}</i></div>`;
  }
  $('statDist').innerHTML = html;
}
$('selStats').addEventListener('change', renderStats);
$('bStats').addEventListener('click', () => {
  $('selStats').value = S.game ? String(S.game.n) : 'all';
  renderStats();
  $('dStats').showModal();
});

// ---------- updates ----------
// The Android app only goes online here, when this button is tapped: it asks
// GitHub for the number of the newest release and compares it with its own.
const REPO = 'paulmatthis/wordguess';
const VERSION = typeof APP_VERSION === 'number' ? APP_VERSION : 0;
$('verText').textContent = VERSION ? `Version 1.${VERSION}` : 'Browser version';

$('bUpdate').addEventListener('click', async () => {
  const out = $('updNote');
  out.textContent = 'Checking…';
  try {
    if (!VERSION) { // browser copy: the service worker fetches new files itself
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      out.textContent = 'The browser version updates itself. Reload the page to be sure you have the newest.';
      return;
    }
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const latest = +(/^v1\.(\d+)$/.exec((await res.json()).tag_name) || [])[1];
    if (!latest) throw new Error('unexpected release name');
    if (latest > VERSION) {
      out.innerHTML = `Version 1.${latest} is available. ` +
        `<a href="https://github.com/${REPO}/releases/latest/download/wordguess.apk" target="_blank" rel="noopener">Download</a>` +
        ', then open the file to install.';
    } else out.textContent = 'You have the latest version.';
  } catch (e) {
    out.textContent = 'Could not check. Is the phone online?';
  }
});

// ---------- other buttons ----------
$('bInfo').addEventListener('click', () => { $('updNote').textContent = ''; $('dInfo').showModal(); });
$('bNew').addEventListener('click', openStart);
$('bAgain').addEventListener('click', () => { dResult.close(); newGame(); });
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
for (const d of [$('dInfo'), $('dStats'), dResult]) d.addEventListener('click', e => { if (e.target === d) d.close(); });

$('bShare').addEventListener('click', async () => {
  const g = S.game;
  const squares = { c: '🟩', p: '🟨', a: '⬛' };
  const text = `Word Guess (${g.n} letters) ${g.won ? g.guesses.length : 'X'}/${MAX_GUESSES}\n` +
    g.guesses.map(w => score(w, g.answer).map(m => squares[m]).join('')).join('\n');
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); $('bShare').textContent = 'Copied'; }
  } catch (e) { /* share sheet dismissed */ }
});

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
  else if (e.key === 'Backspace') press('back');
  else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
});

window.addEventListener('resize', () => { fit(); placeResult(); });
if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);

// ---------- start ----------
buildKeyboard();
if (S.game && answers[S.game.n]) { renderAll(); loadDict(S.game.n); }
else { S.game = null; renderAll(); openStart(); }

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // When a new version has been downloaded, switch to it straight away
  // (the game in progress is saved, so nothing is lost).
  const hadVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadVersion) location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
}
