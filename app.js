/* Thailand 2026 – Familien-Reise-App. Die Reisedaten liegen verschlüsselt in data/
   (Familie und Gäste mit eigenem Passwort), alles Private (Codes, Ausgaben, Haken,
   Dokumente) bleibt lokal im Browser. */
'use strict';

const APP = 'th26';
const BERLIN = 'Europe/Berlin';
const BANGKOK = 'Asia/Bangkok';
const CATS = ['Essen', 'Unterkunft', 'Transport', 'Aktivitäten', 'Einkauf', 'Gebühren', 'Sonstiges'];
const PLAN_TYPES = { regen: 'Regen', muede: 'Müde', hitze: 'Hitze' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const CLAUDE_MODEL = 'claude-opus-5-5';

let trip = null;
const isGuest = () => trip?.role === 'gast';
const FILES = { familie: 'data/familie.enc.json', gast: 'data/gaeste.enc.json', diary: 'data/tagebuch.enc.json' };
const GUEST_ROUTES = ['heute', 'plan', 'tagebuch', 'fluege', 'woerter', 'mehr'];

/* Thai-Wörter, die in Orts- und Programmnamen ständig vorkommen */
const GLOSSARY = {
  Wat: 'Tempel(anlage)', Ao: 'Bucht', Hat: 'Strand', Ko: 'Insel', Koh: 'Insel', Tha: 'Bootsanleger', Talat: 'Markt',
  Khlong: 'Kanal', Laem: 'Kap, Landspitze', Soi: 'Seitengasse', Thanon: 'Straße', Ban: 'Dorf, Haus', Phra: 'heilig, ehrwürdig (Titel)',
  Sanam: 'Platz, Feld', Pak: 'Mündung', Songthaew: 'Sammeltaxi (Pick-up mit zwei Sitzbänken)', 'Tuk-Tuk': 'dreirädriges Motortaxi',
  Yaowarat: 'Hauptstraße von Chinatown', MRT: 'U-Bahn Bangkok', Longtail: 'schmales Holzboot mit Langschaft-Motor', Baht: 'Thai-Währung (฿, THB)'
};


/* ---------- Speicher ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`${APP}.${key}`); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`${APP}.${key}`, JSON.stringify(value)); } catch { toast('Speichern fehlgeschlagen'); }
  },
  del(key) { try { localStorage.removeItem(`${APP}.${key}`); } catch {} }
};

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const mapsUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const photosUrl = q => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
const eur = n => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 1000 ? 0 : 2 });
const num = (n, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const parseNum = s => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fmtMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const checkBadge = it => (it.check ? ' <span class="badge warn">zu prüfen</span>' : '') + (it.open ? ' <span class="badge open">offen</span>' : '') + (it.ai ? ' <span class="badge ai">KI – zu prüfen</span>' : '');

function toast(msg) {
  const el = $('#toast');
  el.innerHTML = `<div>${esc(msg)}</div>`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.innerHTML = ''), 2600);
}

/* Zweimal tippen statt confirm(): der erste Tipp fragt nach, der zweite führt aus */
function confirmTap(btn, label) {
  if (btn.dataset.armed) return true;
  const old = btn.textContent;
  btn.dataset.armed = '1'; btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  return false;
}

/* Aktuelle Zeit; für Tests per ?jetzt=2026-11-03T10:00:00%2B07:00 übersteuerbar */
function now() {
  const p = new URLSearchParams(location.search).get('jetzt');
  const d = p ? new Date(p) : new Date();
  return isNaN(d) ? new Date() : d;
}
function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
function dayLabel(iso, long = false) {
  const d = new Date(iso + 'T12:00:00Z');
  const wd = WEEKDAYS[d.getUTCDay()];
  return long ? `${wd}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.` : `${wd} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
/* Reisedatum: bis zum Abflugtag deutsche Zeit, danach Bangkok-Zeit */
function today() {
  const n = now();
  const b = partsIn(n, BERLIN);
  if (b.date <= trip.meta.start) return { ...b, tz: BERLIN };
  return { ...partsIn(n, BANGKOK), tz: BANGKOK };
}
function countdown(ms) {
  if (ms <= 0) return 'jetzt';
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  if (d >= 2) return `in ${d} Tagen`;
  if (h >= 1) return `in ${h} h ${Math.floor((ms % 3600000) / 60000)} min`;
  return `in ${Math.ceil(ms / 60000)} min`;
}

/* ---------- Tagespläne (lokal anpassbar) ---------- */
/* swaps: {datum: quelldatum} – Inhalte getauschter Tage
   plans: {datum: {choice: 'A'|'B0'|'B1'|'G', custom: {...}, t}} */
function sourceDay(date) {
  const swaps = store.get('swaps', {});
  const src = swaps[date] || date;
  return trip.days.find(d => d.date === src);
}
function calendarDay(date) { return trip.days.find(d => d.date === date); }
function planOptions(date) {
  const day = sourceDay(date);
  if (!day) return [];
  const opts = [{ key: 'A', label: 'Plan A', plan: day.planA }];
  (day.planB || []).forEach((p, i) => opts.push({ key: 'B' + i, label: `Plan B · ${PLAN_TYPES[p.type] || p.type}`, type: p.type, plan: p }));
  const st = store.get('plans', {})[date];
  if (st?.custom) opts.push({ key: 'G', label: st.custom.ai ? 'KI-Plan' : 'Eigener Plan', plan: st.custom });
  return opts;
}
function recommendedType(date) {
  const day = calendarDay(date);
  const w = weatherFor(day?.place, date);
  if (!w) return null;
  if (w.code >= 95 || (w.code >= 61 && w.code <= 82 && w.prob >= 50) || w.prob >= 70 || w.rain >= 8) return 'regen';
  if (w.tmax >= 35) return 'hitze';
  return null;
}
/* Tage mit schlechtem Wetter in der Vorhersage (Open-Meteo reicht bis 16 Tage, verlässlich etwa eine Woche) */
function weatherAlerts(fromDate) {
  return trip.days.filter(d => d.date >= fromDate && d.place !== 'fra').map(d => {
    const type = recommendedType(d.date), w = weatherFor(d.place, d.date);
    if (!type || !w) return null;
    const ahead = Math.round((new Date(d.date + 'T12:00:00Z') - new Date(fromDate + 'T12:00:00Z')) / 86400000);
    return { date: d.date, type, w, ahead, src: sourceDay(d.date), plan: activePlan(d.date) };
  }).filter(Boolean);
}
function alertCard(fromDate) {
  const list = weatherAlerts(fromDate);
  if (!list.length) return '';
  const seen = store.get('wxAlertSeen', {});
  const fresh = list.filter(x => seen[x.date] !== x.type);
  const swap = sunnySwapSuggestion();
  return `<div class="card warnbox"><div class="row between"><b>⚠️ Wetter-Hinweis${list.length > 1 ? ` für ${list.length} Tage` : ''}</b>${fresh.length ? `<button class="btn small ghost" id="wxSeen">Gesehen</button>` : ''}</div>
    ${list.map(x => `<a class="warnrow" href="#/plan/${x.date}"><span class="d">${dayLabel(x.date)}${seen[x.date] !== x.type ? ' <span class="badge open">neu</span>' : ''}</span>
      <span class="grow"><b>${wmo(x.w.code).icon} ${x.type === 'hitze' ? `${Math.round(x.w.tmax)}° Hitze` : `${wmo(x.w.code).text}, Regen ${x.w.prob} %`}</b> · ${esc(x.src.title)}
      <span class="small muted" style="display:block">${x.plan.opt.key === 'A' ? 'Plan A geplant – Plan B ansehen' : `${esc(x.plan.opt.label)} ${x.plan.auto ? 'automatisch gewählt' : 'gewählt'}`}${x.ahead > 7 ? ' · Vorhersage noch unsicher' : ''}</span></span></a>`).join('')}
    ${swap ? `<div class="btns"><button class="btn small" data-wxswap="${swap.from}|${swap.to}">☀️ ${esc(swap.title)} auf ${dayLabel(swap.to)} legen</button></div>` : ''}</div>`;
}
document.addEventListener('click', e => {
  if (e.target.closest('#wxSeen')) { const s = store.get('wxAlertSeen', {}); weatherAlerts(today().date).forEach(x => (s[x.date] = x.type)); store.set('wxAlertSeen', s); rerender(); }
  const sw = e.target.closest('[data-wxswap]');
  if (sw) { const [x, y] = sw.dataset.wxswap.split('|'); swapDays(x, y); toast(`Getauscht: ${dayLabel(x)} ⇄ ${dayLabel(y)}`); rerender(); }
});
function activePlan(date) {
  const opts = planOptions(date);
  const st = store.get('plans', {})[date];
  let opt = st?.choice && opts.find(o => o.key === st.choice);
  let auto = false;
  if (!opt) {
    const rec = recommendedType(date);
    opt = (rec && opts.find(o => o.type === rec)) || opts[0];
    auto = opt && opt.key !== 'A';
  }
  return { opt, opts, auto };
}
function setChoice(date, choice) {
  const plans = store.get('plans', {});
  plans[date] = { ...(plans[date] || {}), choice, t: Date.now() };
  store.set('plans', plans);
}
function setCustom(date, custom) {
  const plans = store.get('plans', {});
  plans[date] = { ...(plans[date] || {}), custom, choice: 'G', t: Date.now() };
  store.set('plans', plans);
}
function swapDays(a, b) {
  const swaps = store.get('swaps', {});
  const sa = swaps[a] || a, sb = swaps[b] || b;
  swaps[a] = sb; swaps[b] = sa;
  for (const k of Object.keys(swaps)) if (swaps[k] === k) delete swaps[k];
  swaps._t = Date.now();
  store.set('swaps', swaps);
  const plans = store.get('plans', {});
  for (const d of [a, b]) if (plans[d] && plans[d].choice !== 'G') { delete plans[d].choice; plans[d].t = Date.now(); }
  store.set('plans', plans);
}

/* ---------- Wetter (Open-Meteo, ohne Schlüssel) ---------- */
const WMO = [
  [0, '☀️', 'Sonnig'], [1, '🌤️', 'Überwiegend sonnig'], [2, '⛅', 'Teils bewölkt'], [3, '☁️', 'Bewölkt'],
  [45, '🌫️', 'Nebel'], [51, '🌦️', 'Nieselregen'], [61, '🌧️', 'Regen'], [66, '🌧️', 'Gefrierender Regen'],
  [71, '🌨️', 'Schnee'], [80, '🌦️', 'Regenschauer'], [95, '⛈️', 'Gewitter']
];
function wmo(code) { let r = WMO[0]; for (const w of WMO) if (code >= w[0]) r = w; return { icon: r[1], text: r[2] }; }
function weatherFor(placeId, date) {
  const c = store.get('wx', {})[placeId];
  if (!c) return null;
  const i = c.daily.time.indexOf(date);
  if (i < 0) return null;
  const d = c.daily;
  return {
    code: d.weather_code[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i],
    prob: d.precipitation_probability_max[i] ?? 0, rain: d.precipitation_sum[i] ?? 0,
    uv: d.uv_index_max?.[i], sunset: d.sunset?.[i]?.slice(11, 16), ts: c.ts
  };
}
function sunScore(w) {
  if (!w) return -999;
  return 100 - w.prob - w.rain * 4 - (w.code >= 95 ? 30 : 0) + (w.code <= 2 ? 15 : 0);
}
async function loadWeather(force = false) {
  const cache = store.get('wx', {});
  const ids = ['bkk', 'samet'];
  const stale = ids.some(id => !cache[id] || Date.now() - cache[id].ts > 3 * 3600000);
  if (!navigator.onLine || (!stale && !force)) return false;
  let changed = false;
  await Promise.all(ids.map(async id => {
    const p = trip.places[id];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunset' +
      `&timezone=${encodeURIComponent(p.tz)}&forecast_days=16`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      cache[id] = { ts: Date.now(), daily: j.daily };
      changed = true;
    } catch (e) { console.warn('Wetter', id, e); }
  }));
  if (changed) store.set('wx', cache);
  return changed;
}
function wxStamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `Stand ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}
function wxBox(placeId, date, label) {
  const w = weatherFor(placeId, date);
  if (!w) return `<div><div class="small muted">${esc(label)}</div><div>Noch keine Vorhersage</div></div>`;
  const m = wmo(w.code);
  return `<div><div class="small muted">${esc(label)} · ${esc(trip.places[placeId].name)}</div>
    <div class="row"><span class="ico">${m.icon}</span><b class="big">${Math.round(w.tmax)}°</b></div>
    <div class="small">${esc(m.text)} · Regen ${w.prob}%${w.rain ? ` (${num(w.rain, 1)} mm)` : ''}</div>
    <div class="small muted">${w.uv != null ? `UV ${Math.round(w.uv)} · ` : ''}${w.sunset ? `Sonnenuntergang ${w.sunset}` : ''}</div></div>`;
}

/* ---------- Haken (Pack-/Checkliste, Unternehmungen) ---------- */
function isChecked(key) { return !!store.get('checks', {})[key]?.v; }
function setChecked(key, v) {
  const c = store.get('checks', {}); c[key] = { v, t: Date.now() }; store.set('checks', c);
}

/* ---------- Ausgaben ---------- */
function fx() { return store.get('fx', trip.meta.fxDefault); }
function budget() { return store.get('budget', trip.meta.dailyBudgetEUR); }
function atmFeeDefault() { return store.get('atmFee', 220); }
function cardFeePct() { return store.get('cardFee', 0); }
function entries() { return store.get('expenses', []).filter(e => !e.deleted); }
/* Ausgaben ohne Abhebungen; Abhebungen sind kein Verbrauch, nur ihre Gebühren */
function expenses() { return entries().filter(e => e.kind !== 'atm'); }
function withdrawals() { return entries().filter(e => e.kind === 'atm'); }
function toEur(e) { return e.currency === 'EUR' ? e.amount : e.amount / fx(); }
/* Abhebung: Gebühren = was die Bank abbucht minus Wert der Baht zum Referenzkurs.
   Ohne Betrag aus der Bank-App wird geschätzt: (Baht + ATM-Gebühr) zum Kurs + Auslandseinsatz. */
function atmCalc(w) {
  const estimated = !(w.eurBooked > 0);
  const booked = estimated ? (w.amount + (w.fee || 0)) / fx() * (1 + cardFeePct() / 100) : w.eurBooked;
  return { booked, estimated, feesEur: Math.max(0, booked - w.amount / fx()), rate: w.amount / booked };
}
function feeEntries() {
  const atm = withdrawals().map(w => {
    const c = atmCalc(w);
    return { id: 'fee-' + w.id, derived: true, date: w.date, category: 'Gebühren', amount: c.feesEur, currency: 'EUR', pay: 'Karte', note: `Abhebung ${num(w.amount, 0)} ฿${c.estimated ? ' (geschätzt)' : ''}` };
  });
  const pct = cardFeePct();
  const card = pct ? expenses().filter(e => e.currency === 'THB' && e.pay === 'Karte').map(e => ({
    id: 'fee-' + e.id, derived: true, date: e.date, category: 'Gebühren', amount: toEur(e) * pct / 100, currency: 'EUR', pay: 'Karte', note: `${num(pct, 2)} % Auslandseinsatz`
  })) : [];
  return [...atm, ...card];
}
function allSpending() {
  const pre = (trip.meta.prepaid || []).map(p => ({ ...p, amount: p.amountEUR, currency: 'EUR', prepaid: true, note: p.label }));
  return [...pre, ...expenses(), ...feeEntries()];
}
function spentOn(date) { return allSpending().filter(e => !e.prepaid && e.date === date).reduce((s, e) => s + toEur(e), 0); }
function cashLeft() {
  return withdrawals().reduce((s, w) => s + w.amount, 0) -
    expenses().filter(e => e.pay === 'bar' && e.currency === 'THB').reduce((s, e) => s + e.amount, 0);
}

/* ---------- Dokumente (IndexedDB, nur lokal) ---------- */
const docsDb = {
  open() {
    return this.p ||= new Promise((res, rej) => {
      const r = indexedDB.open(`${APP}-docs`, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('docs', mode); const s = t.objectStore('docs');
      const out = fn(s); t.oncomplete = () => res(out.result ?? out); t.onerror = () => rej(t.error);
    });
  },
  all() { return this.tx('readonly', s => s.getAll()); },
  put(doc) { return this.tx('readwrite', s => s.put(doc)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); }
};

/* ---------- Router ---------- */
const ROUTES = {
  heute: { title: 'Heute', tab: 'heute', render: renderToday },
  plan: { title: 'Reiseplan', tab: 'plan', render: renderPlan },
  ausgaben: { title: 'Ausgaben', tab: 'ausgaben', render: renderExpenses },
  liste: { title: 'Pack- & Checkliste', tab: 'liste', render: renderPacking },
  mehr: { title: 'Mehr', tab: 'mehr', render: renderMore },
  fluege: { title: 'Flüge', tab: 'mehr', back: true, render: renderFlights },
  unterkuenfte: { title: 'Unterkünfte', tab: 'mehr', back: true, render: renderStays },
  transfers: { title: 'Transfers & Strecken', tab: 'mehr', back: true, render: renderTransfers },
  ideen: { title: 'Unternehmungen', tab: 'mehr', back: true, render: renderIdeas },
  dokumente: { title: 'Tickets & Dokumente', tab: 'mehr', back: true, render: renderDocs },
  notfall: { title: 'Notfall', tab: 'mehr', back: true, render: renderEmergency },
  codes: { title: 'Meine Codes', tab: 'mehr', back: true, render: renderCodes },
  abgleich: { title: 'Abgleich & Einstellungen', tab: 'mehr', back: true, render: renderSync },
  bearbeiten: { title: 'Reisedaten bearbeiten', tab: 'mehr', back: true, render: renderEdit },
  gaeste: { title: 'Gäste-Zugang', tab: 'mehr', back: true, render: renderGuests },
  woerter: { title: 'Thai-Sprachführer', tab: 'mehr', back: true, render: renderWords },
  tagebuch: { title: 'Tagebuch', tab: 'tagebuch', render: renderDiary },
  kinder: { title: 'Für die Kinder', tab: 'mehr', back: true, render: renderKids },
  pilot: { title: 'Pilotenspiel', tab: 'mehr', back: true, render: renderPilot },
  essen: { title: 'Essen', tab: 'mehr', back: true, render: renderFood },
  lernen: { title: 'Lernen', tab: 'mehr', back: true, render: renderLearn },
  atlas: { title: 'Länder-Atlas', tab: 'mehr', back: true, render: renderAtlas }
};
function route() {
  if (!trip) return renderLogin();
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const r = (isGuest() && !GUEST_ROUTES.includes(name) ? null : ROUTES[name]) || ROUTES.heute;
  const tabs = $$('.tabbar a');
  tabs.forEach(a => (a.hidden = isGuest() ? !GUEST_ROUTES.includes(a.dataset.tab) : a.dataset.guestonly != null));
  $('.tabbar').hidden = false;
  $('.tabbar').style.gridTemplateColumns = `repeat(${tabs.filter(a => !a.hidden).length}, 1fr)`;
  $('#pageTitle').textContent = r.title;
  $('#backBtn').hidden = !r.back;
  $('#sosBtn').hidden = isGuest() || name === 'notfall';
  $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === r.tab));
  // frisches Element, damit keine Event-Listener der vorigen Seite hängen bleiben
  const old = $('#app');
  const main = old.cloneNode(false);
  if (old.parentNode) old.parentNode.replaceChild(main, old);
  r.render(main, arg);
  window.scrollTo(0, 0);
}
// verzögert, damit ein Neuzeichnen nie mitten in einem anderen Neuzeichnen passiert
function rerender() {
  clearTimeout(rerender.t);
  rerender.t = setTimeout(() => { const y = window.scrollY; route(); window.scrollTo(0, y); }, 0);
}

/* ---------- Bausteine ---------- */
function glossHtml(text) {
  const hits = [...new Set((String(text).match(/[A-Za-z-]+/g) || []).filter(w => GLOSSARY[w]))];
  return hits.length ? `<div class="gloss">${hits.map(w => `<b>${esc(w)}</b> = ${esc(GLOSSARY[w])}`).join(' · ')}</div>` : '';
}
function wikiTerm(it) {
  if (it.wiki) return it.wiki;
  for (const list of Object.values(trip.ideas || {})) {
    const m = list.find(i => i.wiki && i.maps && i.maps === it.maps);
    if (m) return m.wiki;
  }
  return '';
}
function picsBtn(it) {
  const q = it.maps || it.title;
  if (!q) return '';
  return `<button type="button" class="linkbtn" data-pics="${esc(wikiTerm(it))}" data-q="${esc(q)}">📷 Bilder</button>`;
}
/* Bild und Kurzinfo aus Wikipedia (erst deutsch, dann englisch), zwischengespeichert fürs Offline-Lesen */
async function loadWiki(term) {
  const cache = store.get('wiki', {});
  if (term in cache) return cache[term];
  if (!navigator.onLine) return null;
  const words = term.toLowerCase().split(/\s+/);
  let best = null;
  for (const lang of ['de', 'en']) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1` +
      `&gsrsearch=${encodeURIComponent(term)}&prop=pageimages|extracts|info&inprop=url&exintro=1&explaintext=1&exsentences=2&pithumbsize=640`;
    try {
      const j = await (await fetch(url)).json();
      const page = Object.values(j.query?.pages || {})[0];
      // nur übernehmen, wenn der Artikel wirklich zum Suchbegriff passt
      if (!page || !words.some(w => w.length > 2 && page.title.toLowerCase().includes(w))) continue;
      const hit = { title: page.title, extract: page.extract || '', img: page.thumbnail?.source || '', url: page.fullurl, lang };
      if (!best || (!best.img && hit.img)) best = hit;
      if (best.img) break;
    } catch { return null; }
  }
  cache[term] = best;
  store.set('wiki', cache);
  return best;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-pics]');
  if (!b) return;
  let box = b.nextElementSibling;
  if (box?.classList.contains('pics')) { box.hidden = !box.hidden; return; }
  box = document.createElement('div');
  box.className = 'pics';
  b.after(box);
  const google = `<a href="${photosUrl(b.dataset.q)}" target="_blank" rel="noopener">Mehr Fotos bei Google ↗</a>`;
  const term = b.dataset.pics;
  box.innerHTML = '<span class="spinner"></span>';
  const [w, gallery] = await Promise.all([term ? loadWiki(term) : null, loadCommons(term || b.dataset.q)]);
  const imgs = gallery?.length ? gallery : (w?.img ? [{ thumb: w.img, page: w.url, license: '' }] : []);
  const licenses = [...new Set(imgs.map(i => i.license).filter(Boolean))].join(', ');
  box.innerHTML = (imgs.length ? `<div class="gallery">${imgs.map(i => `<a href="${esc(i.page)}" target="_blank" rel="noopener"><img src="${esc(i.thumb)}" alt="${esc(i.title || '')}" loading="lazy"></a>`).join('')}</div>
      <div class="small muted">Fotos: Wikimedia Commons${licenses ? ` (${esc(licenses)})` : ''} · Bild antippen für Urheber</div>` : '')
    + (w?.extract ? `<div>${esc(w.extract)} <a href="${esc(w.url)}" target="_blank" rel="noopener">Wikipedia ↗</a></div>` : '')
    + (!imgs.length && !w ? `<div class="muted">${navigator.onLine ? 'Keine freien Fotos gefunden.' : 'Offline – Bilder gibt es mit Internet.'}</div>` : '')
    + google;
});
/* Mehrere freie Fotos von Wikimedia Commons; findet auch Buchten ohne eigenen Wikipedia-Artikel */
async function loadCommons(q) {
  const term = String(q).replace(/\bKoh\b/g, 'Ko');
  const cache = store.get('commons', {});
  if (term in cache) return cache[term];
  if (!navigator.onLine) return null;
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=8' +
    `&gsrsearch=${encodeURIComponent(term + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480`;
  try {
    const j = await (await fetch(url)).json();
    const strip = s => String(s || '').replace(/<[^>]*>/g, '').trim();
    const list = Object.values(j.query?.pages || {}).sort((x, y) => (x.index || 0) - (y.index || 0)).map(pg => {
      const ii = pg.imageinfo?.[0] || {};
      return { thumb: ii.thumburl, page: ii.descriptionurl, title: strip(ii.extmetadata?.ObjectName?.value) || pg.title, license: strip(ii.extmetadata?.LicenseShortName?.value), artist: strip(ii.extmetadata?.Artist?.value) };
    }).filter(i => i.thumb).slice(0, 6);
    cache[term] = list;
    store.set('commons', cache);
    return list;
  } catch { return null; }
}

function itemsHtml(items, opts = {}) {
  if (!items?.length) return '<p class="muted">Keine Punkte.</p>';
  return `<ul class="items">${items.map((it, i) => `
    <li class="${opts.highlight === i ? 'now' : ''}">
      <div class="t">${esc(it.time || '–')}</div>
      <div class="grow"><div><b>${esc(it.title)}</b>${checkBadge(it)}</div>
        ${it.place ? `<div class="small muted">${esc(it.place)}</div>` : ''}
        ${it.note ? `<div class="small">${esc(it.note)}</div>` : ''}${glossHtml(`${it.title} ${it.place || ''}`)}${picsBtn(it)}</div>
      ${it.maps ? `<a class="maps small" href="${mapsUrl(it.maps)}" target="_blank" rel="noopener">Karte & Fotos ↗</a>` : ''}
    </li>`).join('')}</ul>`;
}
/* Termine, die nicht verpasst werden dürfen (z. B. digitale Einreisekarte) */
function reminderCards(onlyRelevant) {
  const n = now().getTime();
  const done = store.get('remDone', {});
  return (trip.reminders || []).map(r => {
    const opens = new Date(r.opens).getTime(), due = new Date(r.due).getTime();
    if (done[r.id] || (onlyRelevant && (n < opens - 5 * 86400000 || n > due))) return '';
    const open = n >= opens;
    return `<div class="card ${open ? 'hero' : 'alert'}"><div class="small"><b>📝 ${esc(r.label)}</b></div>
      <div class="big">${open ? 'Jetzt ausfüllen' : esc(r.display)}</div>${open ? '' : `<div><b>${countdown(opens - n)}</b></div>`}
      <div class="small">${esc(r.note)}</div>
      <div class="btns"><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">Zum Formular ↗</a><button class="btn ghost" data-remdone="${esc(r.id)}">✓ Erledigt</button></div></div>`;
  }).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-remdone]');
  if (!b) return;
  const d = store.get('remDone', {}); d[b.dataset.remdone] = Date.now(); store.set('remDone', d); toast('Abgehakt'); rerender();
});
function checkinCards(onlyRelevant) {
  const n = now().getTime();
  return trip.checkins.map(c => {
    const opens = new Date(c.opens).getTime();
    const flight = trip.flights.find(f => c.label.includes(f.number));
    const dep = flight ? new Date(flight.dep).getTime() : opens + 86400000;
    if (onlyRelevant && (n < opens - 3 * 86400000 || n > dep)) return '';
    const open = n >= opens && n < dep;
    const code = store.get('codes', {}).condor;
    return `<div class="card ${open ? 'hero' : 'alert'}">
      <div class="small"><b>✈️ ${esc(c.label)}</b></div>
      <div class="big">${open ? 'Jetzt geöffnet' : esc(c.display)}</div>
      ${open ? '' : `<div><b>${countdown(opens - n)}</b></div>`}
      <div class="small">${esc(c.note)}</div>
      ${code ? `<div class="row" style="margin-top:8px"><span class="code">${esc(code)}</span><button class="btn small ghost" data-copy="${esc(code)}">Kopieren</button></div>`
             : '<div class="small" style="margin-top:6px">Buchungsnummer fehlt → <a href="#/codes">Meine Codes</a></div>'}
      <div class="btns"><a class="btn" href="${esc(c.url)}" target="_blank" rel="noopener">Zu Condor ↗</a></div>
    </div>`;
  }).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Kopiert'), () => toast('Kopieren nicht möglich'));
});

/* ---------- 1. Heute ---------- */
function quickRow(list) {
  return `<nav class="quick" aria-label="Schnellzugriff">${list.map(([href, ico, label]) => href === 'ics'
    ? `<button type="button" data-ics><span class="qi">${ico}</span>${esc(label)}</button>`
    : `<a href="${href}"><span class="qi">${ico}</span>${esc(label)}</a>`).join('')}</nav>`;
}
function tile(href, ico, title, sub, cls = '') {
  return `<a class="tile ${cls}" href="${href}"><span class="ico">${ico}</span><span><b>${esc(title)}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</span></a>`;
}
function renderToday(main) {
  const t = today();
  const { start, end } = trip.meta;
  let html = '';

  if (t.date < start) {
    const days = Math.round((new Date(start + 'T12:00:00Z') - new Date(t.date + 'T12:00:00Z')) / 86400000);
    const bk = partsIn(now(), BANGKOK);
    html += `<div class="next-hero"><div class="label">${esc(trip.meta.subtitle)}</div>
      <div class="huge">Noch ${days} ${days === 1 ? 'Tag' : 'Tage'}</div>
      <div>Abflug ${esc(trip.flights[0].depDisplay)} · ${esc(trip.flights[0].number)}</div>
      <div class="small" style="margin-top:6px;opacity:.9">🕐 In Bangkok ist es jetzt ${fmtMin(bk.min)} Uhr${bk.date !== t.date ? ` (${dayLabel(bk.date)})` : ''}</div></div>`;
    if (!isGuest()) html += reminderCards(false) + checkinCards(false);
    if (!isGuest()) html += quickRow([['ics', '📅', 'Kalender'], ['#/abgleich', '⬇︎', 'Offline'], ['#/liste', '✅', 'Packliste'], ['#/fluege', '✈️', 'Flüge'], ['#/lernen', '📚', 'Lernen'], ['#/kinder', '🧸', 'Kinder']])
      + alertCard(start) + openPointsCard();
    html += `<h2>Erste Reisetage</h2><div class="card"><div class="wx">${wxBox('bkk', addDays(start, 1), dayLabel(addDays(start, 1)))}${wxBox('samet', addDays(start, 2), dayLabel(addDays(start, 2)))}</div>${wxFoot()}</div>`;
    main.innerHTML = html;
    return;
  }
  if (t.date > end) {
    main.innerHTML = `<div class="next-hero"><div class="huge">Willkommen zurück!</div>
      ${isGuest() ? '' : '<p>Die Gesamtausgaben findet ihr unter <a href="#/ausgaben" style="color:#fff">Ausgaben</a>.</p>'}</div>
      <div class="tiles">${tile('#/tagebuch', '📸', 'Tagebuch', 'alle Erinnerungen')}</div>`;
    return;
  }

  const day = calendarDay(t.date);
  const tomorrow = calendarDay(addDays(t.date, 1));
  const { opt, auto } = activePlan(t.date);
  const items = opt?.plan.items || [];
  const nowMin = t.min;
  let idx = items.findIndex(it => toMin(it.time) != null && toMin(it.time) + 45 >= nowMin);
  if (idx < 0 && items.every(it => toMin(it.time) == null)) idx = 0;
  const next = items[idx];

  const other = t.tz === BANGKOK ? ['Deutschland', partsIn(now(), BERLIN)] : ['Bangkok', partsIn(now(), BANGKOK)];
  html += `<div class="headline"><div class="small muted">${dayLabel(t.date, true)} · ${esc(trip.places[day.place].name)} · ${fmtMin(nowMin)} Uhr · 🕐 ${other[0]} ${fmtMin(other[1].min)}${other[1].date !== t.date ? ` (${dayLabel(other[1].date)})` : ''}</div>
    <div class="big">${esc(sourceDay(t.date).title)}</div></div>`;
  if (!isGuest()) html += reminderCards(true) + checkinCards(true);

  if (next) {
    html += `<div class="next-hero"><div class="label">Als Nächstes</div>
      <div class="huge">${esc(next.time || 'heute')}</div>
      <div class="big" style="margin-top:4px">${esc(next.title)}${checkBadge(next)}</div>
      ${next.place ? `<div>${esc(next.place)}</div>` : ''}${next.note ? `<div class="small">${esc(next.note)}</div>` : ''}
      ${next.maps ? `<div class="btns"><a class="btn block" href="${mapsUrl(next.maps)}" target="_blank" rel="noopener">📍 In Google Maps öffnen</a></div>` : ''}</div>`;
  } else {
    const tFirst = tomorrow && activePlan(tomorrow.date).opt?.plan.items[0];
    html += `<div class="next-hero"><div class="label">Heute</div><div class="big">Alles erledigt – Feierabend 🌅</div>${tFirst ? `<div class="small">Morgen: ${esc(tFirst.time)} ${esc(tFirst.title)}</div>` : ''}</div>`;
  }

  const rec = recommendedType(t.date);
  if (auto) html += `<div class="card alert"><b>Wetter: ${PLAN_TYPES[rec]}</b> – automatisch ${esc(opt.label)} gewählt. <a href="#/plan/${t.date}">Ändern</a></div>`;
  else if (rec && opt.key === 'A' && planOptions(t.date).some(o => o.type === rec))
    html += `<div class="card alert"><b>Wetter: ${PLAN_TYPES[rec]}</b> – es gibt einen passenden Plan B. <a href="#/plan/${t.date}">Ansehen</a></div>`;

  const sp = isGuest() ? 0 : spentOn(t.date);
  html += isGuest() ? quickRow([['#/tagebuch', '📸', 'Tagebuch'], ['#/plan', '🗓️', 'Alle Tage'], ['#/woerter', '🗣️', 'Thai']])
    : quickRow([['#/ausgaben', '💶', eur(sp)], ['#/essen', '🍜', 'Essen'], ['#/lernen', '📚', 'Lernen'], ['#/kinder', '🧸', 'Kinder'], ['#/tagebuch', '📸', 'Tagebuch'], ['#/woerter', '🗣️', 'Thai']]);
  if (!isGuest()) html += alertCard(t.date);
  html += `<div class="card"><div class="wx">${wxBox(day.place === 'fra' ? 'bkk' : day.place, t.date, 'Heute')}${tomorrow ? wxBox(tomorrow.place === 'fra' ? 'bkk' : tomorrow.place, tomorrow.date, 'Morgen') : ''}</div>${wxFoot()}</div>`;
  html += `<h2>Heute · ${esc(opt?.label || '')}</h2><div class="card">${itemsHtml(items, { highlight: idx })}
    ${isGuest() ? '' : `<div class="btns"><a class="btn ghost small" href="#/plan/${t.date}">Plan ändern / neu generieren</a></div>`}</div>`;
  main.innerHTML = html;
}
function wxFoot() {
  const ts = Math.max(...Object.values(store.get('wx', {})).map(c => c.ts), 0);
  return `<div class="row between small muted" style="margin-top:8px"><span>${ts ? wxStamp(ts) + (navigator.onLine ? '' : ' (offline)') : 'Noch nicht geladen'} · Open-Meteo</span>
    <button class="btn small ghost" id="wxReload">Aktualisieren</button></div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('#wxReload')) return;
  if (!navigator.onLine) return toast('Offline – zeige letzte Vorhersage');
  toast('Lade Wetter …');
  const ok = await loadWeather(true);
  toast(ok ? 'Wetter aktualisiert' : 'Wetter nicht erreichbar');
  rerender();
});
function openPointsCard() {
  const open = [
    ...trip.stays.filter(s => s.open || s.check).map(s => s.name),
    ...trip.transfers.filter(x => x.check && /offen/.test(`${x.dep} ${x.cost}`)).map(x => `${dayLabel(x.date)}: ${x.from} → ${x.to}`)
  ];
  if (!open.length) return '';
  return `<div class="card open"><b>Offene Punkte</b><ul style="margin:6px 0 0;padding-left:20px">${open.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>`;
}
function budgetMeter(spent, b) {
  const pct = Math.min(100, (spent / b) * 100);
  const left = b - spent;
  return `<div class="meter"><div class="${left < 0 ? 'over' : ''}" style="width:${pct}%"></div></div>
    <div class="small">${left >= 0 ? `Noch ${eur(left)} von ${eur(b)} Tagesbudget` : `${eur(-left)} über Tagesbudget (${eur(b)})`}</div>`;
}

/* ---------- 2. Itinerary ---------- */
function renderPlan(main, openDate) {
  const t = today();
  let html = `<div class="card small">Jeder Tag hat Plan A und Plan B. Bei schlechtem Wetter wird Plan B automatisch vorgeschlagen. ${wxStampShort()}</div>`;
  const sunny = false;
  if (!isGuest()) html += alertCard(t.date < trip.meta.start ? trip.meta.start : t.date);
  if (sunny) html += `<div class="card alert"><b>☀️ ${esc(sunny.title)}</b> liegt auf ${dayLabel(sunny.from)}, sonnigster Tag laut Vorhersage: ${dayLabel(sunny.to)}
      <div class="btns"><button class="btn" data-sunswap="${sunny.from}|${sunny.to}">Auf ${dayLabel(sunny.to)} legen</button></div></div>`;
  html += trip.days.map(d => dayHtml(d.date, d.date === (openDate || t.date))).join('');
  main.innerHTML = html;
  bindPlan(main);
  if (openDate) $(`details[data-date="${openDate}"]`)?.scrollIntoView({ block: 'start' });
}
function wxStampShort() {
  const ts = Math.max(...Object.values(store.get('wx', {})).map(c => c.ts), 0);
  return ts ? `Wetter ${wxStamp(ts)}.` : 'Wetter wird geladen, sobald online.';
}
function sunnySwapSuggestion() {
  const swappable = trip.days.filter(d => d.swap).map(d => d.date);
  const from = swappable.find(date => sourceDay(date)?.needsSun);
  if (!from) return null;
  const scored = swappable.map(date => ({ date, s: sunScore(weatherFor('samet', date)) })).filter(x => x.s > -999);
  if (!scored.length) return null;
  const best = scored.sort((a, b) => b.s - a.s)[0];
  const cur = scored.find(x => x.date === from);
  if (best.date === from || (cur && best.s - cur.s < 10)) return null;
  return { from, to: best.date, title: sourceDay(from).title };
}
function dayHtml(date, open) {
  const cal = calendarDay(date);
  const src = sourceDay(date);
  const { opt, opts, auto } = activePlan(date);
  const rec = recommendedType(date);
  const w = weatherFor(cal.place, date);
  const m = w && wmo(w.code);
  const isToday = date === today().date;
  const swapTargets = cal.swap && !isGuest() ? trip.days.filter(d => d.swap && d.date !== date) : [];
  return `<details class="day ${isToday ? 'today-mark' : ''}" data-date="${date}" ${open ? 'open' : ''}>
    <summary><div class="datepill">${dayLabel(date).replace(' ', '<br>')}</div>
      <div class="grow"><b>${esc(src.title)}</b>${src.date !== date ? ' <span class="badge">getauscht</span>' : ''}
        <div class="small muted">${esc(trip.places[cal.place].name)} · ${esc(opt?.label || '')}</div></div>
      ${m ? `<div style="text-align:right"><div style="font-size:1.4rem">${m.icon}</div><div class="small">${Math.round(w.tmax)}° · ${w.prob}%</div>${rec ? `<span class="badge open">⚠️ ${PLAN_TYPES[rec]}</span>` : ''}</div>` : ''}</summary>
    <div class="body">
      ${rec && opts.some(o => o.type === rec) ? `<div class="card alert" style="margin:0 0 10px">Wetter: <b>${PLAN_TYPES[rec]}</b>${auto ? ' – Plan B automatisch gewählt' : ' – Plan B empfohlen'}</div>` : ''}
      ${opts.length > 1 ? `<div class="seg">${opts.map(o => `<button data-choose="${date}|${o.key}" class="${o.key === opt.key ? 'on' : ''} ${o.type && o.type === rec ? 'rec' : ''}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      <h3>${esc(opt.plan.title || '')}</h3>
      ${itemsHtml(opt.plan.items)}
      <div class="btns">
        ${isGuest() ? '' : `<button class="btn small" data-gen="${date}">🎲 Neu generieren</button>`}
        ${swapTargets.length ? `<select data-swap="${date}" aria-label="Tag tauschen" style="width:auto;min-height:40px;padding:6px"><option value="">⇄ Tauschen mit …</option>
          ${swapTargets.map(d => `<option value="${d.date}">${dayLabel(d.date)} – ${esc(sourceDay(d.date).title)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="gen" id="gen-${date}"></div>
    </div></details>`;
}
function bindPlan(main) {
  main.addEventListener('click', e => {
    const c = e.target.closest('[data-choose]');
    if (c) { const [d, k] = c.dataset.choose.split('|'); setChoice(d, k); return rerender(); }
    const s = e.target.closest('[data-sunswap]');
    if (s) { const [a, b] = s.dataset.sunswap.split('|'); swapDays(a, b); toast(`Getauscht: ${dayLabel(a)} ⇄ ${dayLabel(b)}`); return rerender(); }
    const g = e.target.closest('[data-gen]');
    if (g) return showGenerator(g.dataset.gen);
  });
  main.addEventListener('change', e => {
    const s = e.target.closest('[data-swap]');
    if (s && s.value) { swapDays(s.dataset.swap, s.value); toast(`Getauscht: ${dayLabel(s.dataset.swap)} ⇄ ${dayLabel(s.value)}`); rerender(); }
  });
}

/* ---------- Neu generieren: offline aus dem Ideen-Pool, online mit Claude ---------- */
let lastGen = {};
function generateOffline(date) {
  const cal = calendarDay(date);
  const pool = trip.ideas[cal.place] || [];
  if (!pool.length) return null;
  const rec = recommendedType(date);
  const wet = rec === 'regen';
  const hot = rec === 'hitze';
  const used = new Set(trip.days.flatMap(d => [d.planA, ...(d.planB || [])].flatMap(p => p.items.map(i => i.title))));
  const weight = idea => {
    let w = 1 + Math.random() * 2;
    if (wet) w += idea.weather === 'rain' ? 4 : idea.weather === 'any' ? 2 : -3;
    else w += idea.weather === 'sun' ? 1.5 : idea.weather === 'rain' ? -1 : 0;
    if (hot && idea.time === 'day' && idea.hours > 3) w -= 2;
    if (!idea.kids) w -= 1.5;
    if (isChecked(`idea:${idea.id}`)) w -= 2;
    if (used.has(idea.title)) w -= 0.5;
    if (idea.needsSun && wet) w -= 10;
    return w;
  };
  const slots = [
    { start: hot ? 8 * 60 : 9 * 60, fits: ['morning', 'day', 'any'] },
    { start: hot ? 16 * 60 : 14 * 60 + 30, fits: ['afternoon', 'day', 'any'] },
    { start: 18 * 60, fits: ['evening', 'any'] }
  ];
  const chosen = new Set();
  const items = [];
  for (const s of slots) {
    let cands = pool.filter(i => !chosen.has(i.id) && s.fits.includes(i.time) && (i.hours <= 4 || s === slots[0]));
    if (wet && cands.some(i => i.weather !== 'sun')) cands = cands.filter(i => i.weather !== 'sun');
    cands = cands.map(i => ({ i, w: weight(i) })).sort((a, b) => b.w - a.w);
    if (!cands.length) continue;
    const pick = cands[Math.floor(Math.random() * Math.min(3, cands.length))].i;
    chosen.add(pick.id);
    items.push({ time: fmtMin(s.start), title: pick.title, place: '', maps: pick.maps, note: pick.note || '', check: pick.check });
  }
  if (hot) items.splice(1, 0, { time: '12:00', title: 'Mittags Pause im Schatten', place: '', maps: '' });
  return { title: wet ? 'Gemischt: Regen-tauglich' : hot ? 'Gemischt: hitzefreundlich' : 'Gemischt aus dem Ideen-Pool', items };
}
function showGenerator(date, mode = 'offline') {
  const box = $(`#gen-${date}`);
  if (mode === 'offline') lastGen[date] = [generateOffline(date)].filter(Boolean);
  const plans = lastGen[date] || [];
  const ai = aiConfigured();
  box.innerHTML = `<div class="card" style="margin:12px 0 0">
    ${plans.map((p, i) => `<h3>${esc(p.title)}${p.ai ? ' <span class="badge ai">KI</span>' : ''}</h3>${itemsHtml(p.items)}
      <div class="btns"><button class="btn small" data-take="${i}">✓ In Tagesplan übernehmen</button></div>`).join('<hr style="border:0;border-top:2px solid var(--line);margin:14px 0">') || '<p>Keine Vorschläge.</p>'}
    <div class="btns">
      <button class="btn small ghost" data-remix>🎲 Neu mischen</button>
      <button class="btn small ghost" data-ai ${ai && navigator.onLine ? '' : 'disabled'}>✨ Mit KI (online)</button>
    </div>
    ${ai ? '' : '<div class="small muted">KI: Schlüssel oder Proxy unter <a href="#/codes">Meine Codes</a> eintragen.</div>'}
    <div class="ai-status small"></div></div>`;
  box.onclick = async e => {
    if (e.target.closest('[data-remix]')) return showGenerator(date);
    const t = e.target.closest('[data-take]');
    if (t) { const p = plans[+t.dataset.take]; setCustom(date, { ...p, items: p.items.map(i => ({ ...i, ai: p.ai })) }); toast('Übernommen'); return rerender(); }
    if (e.target.closest('[data-ai]')) {
      const st = $('.ai-status', box);
      st.innerHTML = '<span class="spinner"></span> Claude denkt nach …';
      try {
        lastGen[date] = await generateWithClaude(date);
        showGenerator(date, 'ai');
      } catch (err) { st.textContent = 'KI-Fehler: ' + err.message; }
    }
  };
}
function aiConfigured() { const c = store.get('codes', {}); return !!(c.proxyUrl || c.apiKey); }
async function generateWithClaude(date) {
  const cal = calendarDay(date);
  const place = trip.places[cal.place];
  const w = weatherFor(cal.place, date);
  const t = today();
  const { opt } = activePlan(date);
  const prefs = trip.preferences;
  const ideas = (trip.ideas[cal.place] || []).map(i => i.title).join('; ');
  const wxText = w ? `${wmo(w.code).text}, max ${Math.round(w.tmax)} °C, Regenwahrscheinlichkeit ${w.prob} %, ${num(w.rain, 1)} mm${w.sunset ? `, Sonnenuntergang ${w.sunset}` : ''}` : 'keine Vorhersage verfügbar';
  const prompt = `Wir sind eine Familie (2 Erwachsene, Kinder ${prefs.kids.join(' und ')} Jahre) im Urlaub.
Ort: ${place.name}, Thailand. Datum: ${dayLabel(date, true)}${date === t.date ? `, jetzt ist es ${fmtMin(t.min)} Uhr – plane nur ab jetzt` : ''}.
Wetter: ${wxText}.
Wir mögen: ${prefs.likes.join(', ')}. Bitte nicht: ${prefs.dislikes.join(', ')}.
Bisheriger Plan, der nicht passt: ${opt.plan.items.map(i => `${i.time} ${i.title}`).join('; ')}.
Ideen, die wir schon kennen: ${ideas}.

Schlag zwei ganz neue, realistische Tagespläne vor (je 3–5 Punkte), passend zu Wetter, Uhrzeit und Kindern. Nur echte Orte, die es auf/in ${place.name} gibt. Setze "unsure": true bei allem, wo du dir bei Existenz, Öffnungszeit oder Preis nicht sicher bist.
Antworte ausschließlich mit JSON in dieser Form, ohne weiteren Text:
{"plans":[{"title":"…","items":[{"time":"HH:MM","title":"…","place":"…","mapsQuery":"Suchbegriff für Google Maps","note":"kurz, mit Preis falls bekannt","unsure":true}]}]}`;

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }]
  };
  const c = store.get('codes', {});
  let r;
  if (c.proxyUrl) {
    r = await fetch(c.proxyUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-token': c.proxyToken || '' }, body: JSON.stringify(body) });
  } else {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  if (j.stop_reason === 'refusal') throw new Error('Anfrage wurde abgelehnt');
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Antwort nicht lesbar');
  const parsed = JSON.parse(m[0]);
  return (parsed.plans || []).map(p => ({
    title: p.title, ai: true,
    items: (p.items || []).map(i => ({ time: i.time || '', title: i.title || '', place: i.place || '', maps: i.mapsQuery || i.place || '', note: i.note || '', check: true }))
  }));
}

/* ---------- 3. Flüge ---------- */
function renderFlights(main) {
  const code = store.get('codes', {}).condor;
  main.innerHTML = (isGuest() ? '' : `<div class="btns pad"><button class="btn" data-ics>📅 Alle Termine in den Kalender</button></div>` + reminderCards(false) + checkinCards(false)) + trip.flights.map(f => `<div class="card">
    <div class="row between"><span class="big">${esc(f.number)}</span>${isGuest() ? '' : '<span class="badge ok">gebucht</span>'}</div>
    <div class="muted">${esc(f.airline)} · ${esc(f.class)}</div>
    <dl class="kv" style="margin-top:10px">
      <dt>Ab</dt><dd>${esc(f.from)}<br>${esc(f.depDisplay)}</dd>
      <dt>An</dt><dd>${esc(f.to)}<br>${esc(f.arrDisplay)}</dd>
      <dt>Dauer</dt><dd>${durationText(f.dep, f.arr)}</dd>
      ${isGuest() ? '' : `<dt>Sitze</dt><dd>${esc(f.seats)}</dd>
      <dt>Gepäck</dt><dd>${esc(f.baggage)}${f.baggageCheck ? ' <span class="badge warn">zu prüfen</span>' : ''}</dd>
      <dt>Buchung</dt><dd>${esc(f.booking)}</dd>
      <dt>Code</dt><dd>${code ? `<span class="code">${esc(code)}</span> <button class="btn small ghost" data-copy="${esc(code)}">Kopieren</button>` : '<a href="#/codes">in Meine Codes eintragen</a>'}</dd>`}
    </dl></div>`).join('');
}
function durationText(a, b) {
  const m = Math.round((new Date(b) - new Date(a)) / 60000);
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/* ---------- 4. Unterkünfte ---------- */
function renderStays(main) {
  const codes = store.get('codes', {});
  const codeKey = { bkk1: 'airbnb', samet: 'samet', bkk2: 'bkk2' };
  main.innerHTML = trip.stays.map(s => {
    const code = codes[codeKey[s.id]];
    return `<div class="card ${s.open ? 'open' : ''}">
      <div class="row between"><h3 class="grow">${esc(s.name)}</h3>
        <span class="badge ${s.status === 'gebucht' ? 'ok' : s.open ? 'open' : 'warn'}">${esc(s.status)}</span></div>
      ${s.host ? `<div class="muted">${esc(s.host)}</div>` : ''}
      <dl class="kv" style="margin-top:8px">
        ${s.address ? `<dt>Adresse</dt><dd>${esc(s.address)}</dd>` : ''}
        <dt>Check-in</dt><dd>${esc(s.checkin)}</dd><dt>Check-out</dt><dd>${esc(s.checkout)}</dd>
        <dt>Nächte</dt><dd>${s.nights}</dd>
        ${s.phone ? `<dt>Telefon</dt><dd><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></dd>` : ''}
        ${code ? `<dt>Code</dt><dd><span class="code">${esc(code)}</span> <button class="btn small ghost" data-copy="${esc(code)}">Kopieren</button></dd>` : ''}
      </dl>
      ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
      <div class="btns">
        ${s.maps ? `<a class="btn" href="${mapsUrl(s.maps)}" target="_blank" rel="noopener">📍 Karte</a>` : ''}
        ${s.link ? `<a class="btn ghost" href="${esc(s.link)}" target="_blank" rel="noopener">Buchung ↗</a>` : ''}
      </div></div>`;
  }).join('');
}

/* ---------- 5. Transfers ---------- */
function renderTransfers(main) {
  const byDate = {};
  trip.transfers.forEach(x => (byDate[x.date] ||= []).push(x));
  main.innerHTML = Object.entries(byDate).map(([date, list]) => `<h2>${dayLabel(date, true)}</h2>` + list.map(x => `
    <div class="card"><div class="row between"><b class="grow">${esc(x.from)} → ${esc(x.to)}</b>${x.check ? '<span class="badge warn">zu prüfen</span>' : ''}</div>
      <dl class="kv" style="margin-top:6px"><dt>Abfahrt</dt><dd>${esc(x.dep)}</dd><dt>Mit</dt><dd>${esc(x.mode)}</dd>
      ${x.duration ? `<dt>Dauer</dt><dd>${esc(x.duration)}</dd>` : ''}<dt>Kosten</dt><dd>${esc(x.cost)}</dd></dl>
      ${x.note ? `<p class="small" style="margin-bottom:0">${esc(x.note)}</p>` : ''}</div>`).join('')).join('');
}

/* ---------- 6. Unternehmungen ---------- */
function renderIdeas(main, placeArg) {
  const place = placeArg && trip.ideas[placeArg] ? placeArg : (calendarDay(today().date)?.place === 'samet' ? 'samet' : 'bkk');
  const list = trip.ideas[place];
  const done = list.filter(i => isChecked(`idea:${i.id}`)).length;
  const cost = ['gratis', '€', '€€', '€€€'];
  const wxIcon = { sun: '☀️', rain: '🌧️ geht bei Regen', any: '🌤️ jedes Wetter' };
  const days = trip.days.filter(d => d.place === place);
  main.innerHTML = `<div class="seg pad" style="margin-top:12px">${Object.keys(trip.ideas).map(p => `<a class="chip ${p === place ? 'on' : ''}" href="#/ideen/${p}" style="text-decoration:none;display:inline-flex;align-items:center">${esc(trip.places[p].name)}</a>`).join('')}</div>
    <div class="pad small muted">${done} von ${list.length} erledigt</div>
    <div class="card">${list.map(i => `<div class="check ${isChecked(`idea:${i.id}`) ? 'done' : ''}">
      <input type="checkbox" data-key="idea:${i.id}" ${isChecked(`idea:${i.id}`) ? 'checked' : ''} aria-label="${esc(i.title)}">
      <div class="grow"><div class="lbl"><b>${esc(i.title)}</b>${checkBadge(i)}</div>
        <div class="small muted">${wxIcon[i.weather] || ''} · ca. ${String(i.hours).replace('.', ',')} h · ${cost[i.cost]}${i.kids ? '' : ' · eher für Eltern'}</div>
        ${i.note ? `<div class="small">${esc(i.note)}</div>` : ''}${glossHtml(i.title)}
        ${picsBtn(i)}
        <div class="row small" style="margin-top:4px">${i.maps ? `<a href="${mapsUrl(i.maps)}" target="_blank" rel="noopener" class="maps">Karte & Fotos ↗</a>` : ''}
          <select data-add="${i.id}" style="width:auto;min-height:36px;padding:4px;font-size:.85rem"><option value="">＋ zu Tag …</option>${days.map(d => `<option value="${d.date}">${dayLabel(d.date)}</option>`).join('')}</select></div>
      </div></div>`).join('')}</div>`;
  main.addEventListener('change', e => {
    const cb = e.target.closest('input[data-key]');
    if (cb) { setChecked(cb.dataset.key, cb.checked); cb.closest('.check').classList.toggle('done', cb.checked); return; }
    const sel = e.target.closest('select[data-add]');
    if (sel && sel.value) {
      const idea = list.find(i => i.id === sel.dataset.add);
      const date = sel.value;
      const base = activePlan(date).opt.plan;
      const items = [...base.items, { time: '', title: idea.title, place: '', maps: idea.maps, note: idea.note || '', check: idea.check }];
      setCustom(date, { title: `${base.title || 'Plan'} + Extra`, items });
      toast(`Zu ${dayLabel(date)} hinzugefügt`);
      sel.value = '';
    }
  });
}

/* ---------- 7. Tickets & Dokumente ---------- */
async function renderDocs(main) {
  let docs = [];
  try { docs = await docsDb.all(); } catch { main.innerHTML = '<div class="card open">Dieser Browser erlaubt keinen lokalen Dokumentenspeicher (z. B. privater Modus).</div>'; return; }
  const notes = store.get('docNotes', {});
  docs = docs.filter(d => d.id !== 'bg');
  const slots = [...trip.documentSlots, ...store.get('docSlots', [])];
  main.innerHTML = `<div class="card small">Nur auf diesem Handy gespeichert, nicht im Internet. Fotos, Screenshots oder PDFs von Bestätigungen.</div>` +
    slots.map(slot => `<div class="card"><h3>${esc(slot)}</h3>
      ${docs.filter(d => d.slot === slot).map(d => `<div class="exp"><span>${d.type.startsWith('image/') ? '🖼️' : '📄'}</span>
        <a class="grow" href="#" data-open="${d.id}">${esc(d.name)}</a><button class="x" data-deldoc="${d.id}" aria-label="Löschen">×</button></div>`).join('')}
      <textarea data-note="${esc(slot)}" placeholder="Notiz (z. B. Uhrzeit, Kontakt)">${esc(notes[slot] || '')}</textarea>
      <div class="btns"><label class="btn small ghost">＋ Datei/Foto<input type="file" accept="image/*,application/pdf" data-upload="${esc(slot)}" hidden></label></div></div>`).join('') +
    `<div class="card"><label class="field"><span>Neuer Bereich</span><input id="newSlot" placeholder="z. B. Roller-Mietvertrag"></label><button class="btn small" id="addSlot">Hinzufügen</button></div>`;
  main.onchange = async e => {
    const up = e.target.closest('[data-upload]');
    if (up && up.files[0]) {
      const f = up.files[0];
      try { await docsDb.put({ id: uid(), slot: up.dataset.upload, name: f.name, type: f.type, blob: f, added: Date.now() }); toast('Gespeichert'); }
      catch { toast('Speicher voll oder nicht erlaubt'); }
      renderDocs(main);
    }
  };
  main.oninput = e => {
    const n = e.target.closest('[data-note]');
    if (n) { const all = store.get('docNotes', {}); all[n.dataset.note] = n.value; store.set('docNotes', all); }
  };
  main.onclick = async e => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); const d = docs.find(x => x.id === o.dataset.open); window.open(URL.createObjectURL(d.blob), '_blank'); }
    const del = e.target.closest('[data-deldoc]');
    if (del && confirmTap(del, 'Löschen?')) { await docsDb.del(del.dataset.deldoc); renderDocs(main); }
    if (e.target.closest('#addSlot')) {
      const v = $('#newSlot').value.trim();
      if (v) { store.set('docSlots', [...store.get('docSlots', []), v]); renderDocs(main); }
    }
  };
}

/* ---------- 8. Ausgaben ---------- */
function renderExpenses(main) {
  const t = today();
  const def = store.get('expDraft', { currency: 'THB', category: 'Essen', pay: 'bar' });
  const mode = store.get('expMode', 'ausgabe');
  const inTrip = t.date >= trip.meta.start && t.date <= trip.meta.end;
  const list = allSpending();
  const total = list.reduce((s, e) => s + toEur(e), 0);
  const onsite = list.filter(e => !e.prepaid).reduce((s, e) => s + toEur(e), 0);
  const fees = feeEntries().reduce((s, e) => s + e.amount, 0);
  const byCat = Object.fromEntries(CATS.map(c => [c, 0]));
  list.forEach(e => (byCat[e.category] = (byCat[e.category] || 0) + toEur(e)));
  const byDay = {};
  list.filter(e => !e.prepaid).forEach(e => (byDay[e.date] = (byDay[e.date] || 0) + toEur(e)));
  const b = budget();
  const maxCat = Math.max(...Object.values(byCat), 1);
  const maxDay = Math.max(...Object.values(byDay), b || 0, 1);
  const todaySpent = byDay[t.date] || 0;
  const ws = withdrawals();
  const shown = [...list.filter(e => !e.derived), ...ws].sort((a, b2) => (b2.date + (b2.ts || '')).localeCompare(a.date + (a.ts || '')));
  const dateField = `<label class="field"><span>Datum</span><input type="date" id="expDate" value="${inTrip ? t.date : trip.meta.start}" min="2026-10-01" max="2026-11-30"></label>`;

  main.innerHTML = `
  <div class="card hero">
    <div class="seg" style="margin-top:0">${[['ausgabe', 'Ausgabe'], ['atm', '🏧 Geld abheben']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${mode === 'ausgabe' ? `
    <form id="expForm" autocomplete="off">
      <div class="row"><input class="amount grow" id="amt" inputmode="decimal" placeholder="0" aria-label="Betrag" required>
        <div class="seg" style="margin:0">${['THB', 'EUR'].map(c => `<button type="button" data-cur="${c}" class="${def.currency === c ? 'on' : ''}">${c === 'THB' ? '฿ THB' : '€ EUR'}</button>`).join('')}</div></div>
      <div class="small muted" id="amtEur">&nbsp;</div>
      <div class="seg">${CATS.map(c => `<button type="button" data-cat="${c}" class="${def.category === c ? 'on' : ''}">${c}</button>`).join('')}</div>
      <div class="grid2">
        ${dateField}
        <div class="field"><span class="small muted" style="display:block;margin-bottom:4px">Zahlung</span><div class="seg" style="margin:0">${['bar', 'Karte'].map(p => `<button type="button" data-pay="${p}" class="${def.pay === p ? 'on' : ''}">${p}</button>`).join('')}</div></div>
      </div>
      <label class="field"><span>Notiz</span><input id="expNote" placeholder="optional"></label>
      <button class="btn block" type="submit">Ausgabe speichern</button>
    </form>` : `
    <form id="atmForm" autocomplete="off">
      <label class="field"><span>Abgehoben (Baht, ohne Gebühr)</span><input class="amount" id="atmAmt" inputmode="decimal" placeholder="10000" required></label>
      <div class="grid2">
        <label class="field"><span>ATM-Gebühr (Baht, steht am Automaten)</span><input id="atmFee" inputmode="decimal" value="${num(atmFeeDefault(), 0)}"></label>
        ${dateField}
      </div>
      <label class="field"><span>Abgebucht in € (aus der Bank-App, später nachtragen)</span><input id="atmEur" inputmode="decimal" placeholder="leer = schätzen"></label>
      <div class="small muted" id="atmHint">&nbsp;</div>
      <button class="btn block" type="submit">Abhebung speichern</button>
      <p class="small muted" style="margin-bottom:0">Am Automaten „ohne Umrechnung“ bzw. in Baht abrechnen lassen. Die Baht-Ausgaben erfasst ihr wie gewohnt als „bar“.</p>
    </form>`}
  </div>
  <div class="card">
    <div class="row between"><span>Gesamt inkl. vorab bezahlt</span><b class="big">${eur(total)}</b></div>
    <div class="row between small"><span>davon vor Ort</span><b>${eur(onsite)}</b></div>
    ${fees ? `<div class="row between small"><span>davon Gebühren & Kursverlust</span><b>${eur(fees)}</b></div>` : ''}
    ${ws.length ? `<div class="row between small"><span>Bargeld übrig (rechnerisch)</span><b>${num(cashLeft(), 0)} ฿</b></div>` : ''}
    ${b && inTrip ? `<div style="margin-top:10px"><b>Heute: ${eur(todaySpent)}</b>${budgetMeter(todaySpent, b)}</div>` : ''}
  </div>
  <h2>Pro Kategorie</h2>
  <div class="card">${CATS.map(c => `<div class="bar"><span>${c}</span><div class="track"><div class="fill" style="width:${(byCat[c] / maxCat) * 100}%"></div></div><b>${eur(byCat[c])}</b></div>`).join('')}</div>
  <h2>Pro Tag (vor Ort)</h2>
  <div class="card">${Object.keys(byDay).length ? Object.keys(byDay).sort().map(d => `<div class="bar"><span>${dayLabel(d)}</span><div class="track"><div class="fill ${b && byDay[d] > b ? 'over' : ''}" style="width:${(byDay[d] / maxDay) * 100}%"></div></div><b>${eur(byDay[d])}</b></div>`).join('') + (b ? `<div class="small muted">Orange = über Tagesbudget ${eur(b)}</div>` : '') : '<p class="muted">Noch keine Ausgaben vor Ort.</p>'}</div>
  <h2>Alle Posten</h2>
  <div class="card">${shown.map(e => e.kind === 'atm' ? atmRow(e) : `
    <div class="exp"><div class="grow"><b>${esc(e.category)}</b>${e.prepaid ? ' <span class="badge">vorab</span>' : ''}
      <div class="small muted">${dayLabel(e.date)} · ${esc(e.pay || '')}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="amt">${e.currency === 'THB' ? `${num(e.amount, 0)} ฿<div class="small muted">${eur(toEur(e))}</div>` : eur(e.amount)}</div>
      ${e.prepaid ? '<span style="width:44px"></span>' : `<button class="x" data-delexp="${e.id}" aria-label="Löschen">×</button>`}</div>`).join('')}</div>
  <div class="card">
    <div class="grid2">
      <label class="field"><span>Referenzkurs: 1 € = … THB</span><input id="fx" inputmode="decimal" value="${num(fx(), 2)}"></label>
      <label class="field"><span>Tagesbudget € (leer = aus)</span><input id="budget" inputmode="decimal" value="${b ? num(b, 0) : ''}"></label>
      <label class="field"><span>ATM-Gebühr Standard (Baht)</span><input id="atmFeeDef" inputmode="decimal" value="${num(atmFeeDefault(), 0)}"></label>
      <label class="field"><span>Auslandseinsatz Karte (%)</span><input id="cardFee" inputmode="decimal" value="${num(cardFeePct(), 2)}"></label>
    </div>
    <p class="small muted">Auslandseinsatz: steht im Preisverzeichnis eurer Kreditkarte (oft 0–2 %). Gilt für Kartenzahlungen in Baht und für Abhebungen ohne nachgetragenen €-Betrag.</p>
    <div class="btns"><button class="btn ghost" id="csv">⬇︎ CSV exportieren</button><a class="btn ghost" href="#/abgleich">⇄ Mit 2. Handy abgleichen</a></div>
  </div>`;

  const draft = { ...def };
  const amt = $('#amt');
  const showEur = () => {
    if (!amt) return;
    const v = parseNum(amt.value);
    $('#amtEur').textContent = v > 0 ? (draft.currency === 'THB' ? `≈ ${eur(v / fx())}` : `≈ ${num(v * fx(), 0)} ฿`) : ' ';
  };
  amt?.addEventListener('input', showEur);
  const atmHint = () => {
    const v = parseNum($('#atmAmt').value), f = parseNum($('#atmFee').value) || 0, booked = parseNum($('#atmEur').value);
    if (!(v > 0)) { $('#atmHint').textContent = ' '; return; }
    const c = atmCalc({ amount: v, fee: f, eurBooked: booked });
    $('#atmHint').textContent = `${c.estimated ? 'Geschätzt ' : ''}${eur(c.booked)} · Kurs effektiv 1 € = ${num(c.rate, 2)} ฿ · Gebühren ${eur(c.feesEur)}`;
  };
  $$('#atmAmt,#atmFee,#atmEur', main).forEach(i => i.addEventListener('input', atmHint));
  main.addEventListener('click', e => {
    const m = e.target.closest('button[data-mode]');
    if (m) { store.set('expMode', m.dataset.mode); return rerender(); }
    const btn = e.target.closest('button[data-cur],button[data-cat],button[data-pay]');
    if (btn) {
      const [k, field] = btn.dataset.cur ? ['cur', 'currency'] : btn.dataset.cat ? ['cat', 'category'] : ['pay', 'pay'];
      draft[field] = btn.dataset[k];
      $$(`button[data-${k}]`, main).forEach(b2 => b2.classList.toggle('on', b2 === btn));
      store.set('expDraft', draft); showEur(); return;
    }
    const del = e.target.closest('[data-delexp]');
    if (del && confirmTap(del, 'Löschen?')) {
      const all = store.get('expenses', []);
      const x = all.find(i => i.id === del.dataset.delexp);
      if (x) { x.deleted = true; x.updated = Date.now(); }
      store.set('expenses', all); rerender();
    }
    const fixEur = e.target.closest('[data-atmeur]');
    if (fixEur) {
      const row = fixEur.closest('.exp');
      const v = parseNum($('input', row).value);
      if (!(v > 0)) { toast('€-Betrag eingeben'); return; }
      const all = store.get('expenses', []);
      const x = all.find(i => i.id === fixEur.dataset.atmeur);
      if (x) { x.eurBooked = v; x.updated = Date.now(); }
      store.set('expenses', all); toast('Nachgetragen'); rerender();
    }
    if (e.target.closest('#csv')) exportCsv();
  });
  $('#expForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const v = parseNum(amt.value);
    if (!(v > 0)) { toast('Betrag eingeben'); return; }
    const all = store.get('expenses', []);
    all.push({ id: uid(), amount: v, currency: draft.currency, category: draft.category, pay: draft.pay, date: $('#expDate').value, note: $('#expNote').value.trim(), ts: new Date().toISOString(), updated: Date.now() });
    store.set('expenses', all);
    toast(`Gespeichert: ${draft.currency === 'THB' ? num(v, 0) + ' ฿' : eur(v)}`);
    rerender();
  });
  $('#atmForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const v = parseNum($('#atmAmt').value);
    if (!(v > 0)) { toast('Betrag eingeben'); return; }
    const booked = parseNum($('#atmEur').value);
    const all = store.get('expenses', []);
    all.push({ id: uid(), kind: 'atm', amount: v, currency: 'THB', fee: parseNum($('#atmFee').value) || 0, eurBooked: booked > 0 ? booked : null, category: 'Bargeld', pay: 'Karte', date: $('#expDate').value, ts: new Date().toISOString(), updated: Date.now() });
    store.set('expenses', all);
    toast(`Abhebung gespeichert: ${num(v, 0)} ฿`);
    rerender();
  });
  const setNum = (id, key, allowZero) => $(id).addEventListener('change', e => { const v = parseNum(e.target.value); if (v > 0 || (allowZero && v === 0)) { store.set(key, v); rerender(); } });
  setNum('#fx', 'fx');
  setNum('#atmFeeDef', 'atmFee', true);
  setNum('#cardFee', 'cardFee', true);
  $('#budget').addEventListener('change', e => { const v = parseNum(e.target.value); store.set('budget', v > 0 ? v : null); rerender(); });
}
function atmRow(w) {
  const c = atmCalc(w);
  return `<div class="exp"><div class="grow"><b>🏧 Abhebung</b>${c.estimated ? ' <span class="badge warn">€ geschätzt</span>' : ''}
      <div class="small muted">${dayLabel(w.date)} · ${num(w.amount, 0)} ฿ + ${num(w.fee || 0, 0)} ฿ Gebühr · Kurs effektiv 1 € = ${num(c.rate, 2)} ฿</div>
      <div class="small">Gebühren & Kursverlust: <b>${eur(c.feesEur)}</b></div>
      ${c.estimated ? `<div class="row" style="margin-top:6px"><input inputmode="decimal" placeholder="€ laut Bank-App" style="width:150px;min-height:40px;padding:6px" aria-label="Abgebuchter Betrag in Euro"><button class="btn small ghost" data-atmeur="${w.id}">Nachtragen</button></div>` : ''}</div>
    <div class="amt">${eur(c.booked)}</div>
    <button class="x" data-delexp="${w.id}" aria-label="Löschen">×</button></div>`;
}
function exportCsv() {
  const rows = [['Datum', 'Kategorie', 'Betrag', 'Währung', 'Betrag EUR', 'Zahlung', 'Notiz', 'Kurs']];
  allSpending().sort((a, b) => a.date.localeCompare(b.date)).forEach(e =>
    rows.push([e.date, e.category, num(e.amount, 2), e.currency, num(toEur(e), 2), e.pay || '', e.note || '', e.currency === 'THB' ? num(fx(), 2) : '']));
  // Abhebungen getrennt: kein Verbrauch (die Baht-Ausgaben stehen oben), Gebühren stecken schon in „Gebühren“
  withdrawals().sort((a, b) => a.date.localeCompare(b.date)).forEach(w => {
    const c = atmCalc(w);
    rows.push([w.date, 'Bargeld abgehoben (nicht in Summe)', num(w.amount, 2), 'THB', num(c.booked, 2), 'Karte', `ATM-Gebühr ${num(w.fee || 0, 0)} THB${c.estimated ? ', € geschätzt' : ''}`, num(c.rate, 2)]);
  });
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadOrShare(new Blob([csv], { type: 'text/csv' }), 'thailand-ausgaben.csv');
}
async function downloadOrShare(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
}

/* ---------- 9. Pack- und Checkliste ---------- */
function renderPacking(main) {
  const extra = store.get('packExtra', []);
  const groups = [...trip.packing, ...(extra.length ? [{ group: 'Eigene', items: extra, own: true }] : [])];
  const all = groups.flatMap(g => g.items.map(i => `pack:${g.group}:${i}`));
  const done = all.filter(isChecked).length;
  main.innerHTML = `<div class="card"><div class="row between"><b>${done} von ${all.length} erledigt</b></div>
    <div class="meter"><div style="width:${(done / Math.max(all.length, 1)) * 100}%"></div></div></div>` +
    groups.map(g => `<h2>${esc(g.group)}</h2><div class="card">${g.items.map(i => {
      const k = `pack:${g.group}:${i}`;
      return `<label class="check ${isChecked(k) ? 'done' : ''}"><input type="checkbox" data-key="${esc(k)}" ${isChecked(k) ? 'checked' : ''}>
        <span class="lbl grow">${esc(i)}</span>${g.own ? `<button class="x" data-delpack="${esc(i)}" aria-label="Entfernen">×</button>` : ''}</label>`;
    }).join('')}</div>`).join('') +
    `<div class="card"><label class="field"><span>Eigener Punkt</span><input id="newPack" placeholder="z. B. Lieblingskissen"></label><button class="btn small" id="addPack">Hinzufügen</button></div>`;
  main.addEventListener('change', e => {
    const cb = e.target.closest('input[data-key]');
    if (cb) { setChecked(cb.dataset.key, cb.checked); cb.closest('.check').classList.toggle('done', cb.checked); }
  });
  main.addEventListener('click', e => {
    if (e.target.closest('#addPack')) {
      const v = $('#newPack').value.trim();
      if (v) { store.set('packExtra', [...extra, v]); rerender(); }
    }
    const d = e.target.closest('[data-delpack]');
    if (d) { e.preventDefault(); store.set('packExtra', extra.filter(x => x !== d.dataset.delpack)); rerender(); }
  });
}

/* ---------- 10. Notfall ---------- */
function renderEmergency(main) {
  const em = trip.emergency;
  const c = store.get('codes', {});
  // aktueller Ort zuerst: auf Koh Samet die Insel-Kliniken, sonst Bangkok
  const here = calendarDay(today().date)?.place === 'samet' ? 'samet' : 'bkk';
  const order = here === 'samet' ? ['samet', 'bkk'] : ['bkk', 'samet'];
  const medical = em.medical || [];
  const medCard = m => `<div class="card"><div class="row between"><b class="grow">${esc(m.name)}</b>${m.check ? '<span class="badge warn">zu prüfen</span>' : ''}</div>
      <div class="small muted">${esc(m.kind)}${m.hours ? ' · ' + esc(m.hours) : ''}</div>
      ${m.phones.map(ph => `<a class="tel" href="tel:${esc(ph.tel)}"><span>📞 Anrufen</span><b style="font-size:1.1rem">${esc(ph.show)}</b></a>`).join('')}
      ${m.note ? `<div class="small">${esc(m.note)}</div>` : ''}
      <div class="btns"><a class="btn small" href="${mapsUrl(m.maps)}" target="_blank" rel="noopener">📍 Route</a></div></div>`;
  main.innerHTML = `<div class="card alert"><b>Lebensgefahr: 1669 anrufen</b> (Rettungsdienst). Touristenpolizei mit Englisch: 1155.</div>
    <div class="btns pad">
      <a class="btn" href="${mapsUrl('Krankenhaus')}" target="_blank" rel="noopener">🏥 Krankenhaus in der Nähe</a>
      <a class="btn ghost" href="${mapsUrl('Kinderarzt pediatrician')}" target="_blank" rel="noopener">🧒 Kinderarzt in der Nähe</a>
      <a class="btn ghost" href="${mapsUrl('Apotheke pharmacy')}" target="_blank" rel="noopener">💊 Apotheke in der Nähe</a>
    </div>
    ${order.map(pl => medical.some(m => m.place === pl) ? `<h2>Ärzte & Kliniken: ${esc(trip.places[pl].name)}${pl === here ? ' (ihr seid hier)' : ''}</h2>${medical.filter(m => m.place === pl).map(medCard).join('')}` : '').join('')}
    <p class="pad small muted">Telefonnummern aus Krankenhaus-Websites und Reiseportalen, Stand 23.10.2026. Mit „zu prüfen“ markierte vor der Reise einmal anrufen oder auf der Website nachsehen.</p>
    <h2>Notrufnummern Thailand</h2><div class="card">${em.numbers.map(n => `<a class="tel" href="tel:${n.tel}"><span>${esc(n.label)}</span><b>${esc(n.tel)}</b></a>`).join('')}</div>
    <h2>${esc(em.embassy.name)}</h2><div class="card">
      <div>${esc(em.embassy.address)}</div>
      <a class="tel" href="tel:${em.embassy.tel}"><span>Zentrale</span><b>${esc(em.embassy.telDisplay)}</b></a>
      <a class="tel" href="tel:${em.embassy.emergency}"><span>${esc(em.embassy.emergencyDisplay)}</span><b>📞</b></a>
      <div class="btns"><a class="btn" href="${mapsUrl(em.embassy.maps)}" target="_blank" rel="noopener">📍 Karte</a><a class="btn ghost" href="${esc(em.embassy.url)}" target="_blank" rel="noopener">Website ↗</a></div>
      <div class="small muted">${esc(em.embassy.note)}</div></div>
    <h2>Versicherung</h2><div class="card">
      ${c.insuranceTel ? `<a class="tel" href="tel:${esc(c.insuranceTel.replace(/[^\d+]/g, ''))}"><span>Hotline</span><b>${esc(c.insuranceTel)}</b></a>` : '<p>Hotline fehlt → <a href="#/codes">Meine Codes</a></p>'}
      ${c.insuranceNo ? `<div>Versicherungsnr.: <span class="code">${esc(c.insuranceNo)}</span></div>` : ''}</div>
    <h2>Sonstiges</h2><div class="card">${em.other.map(n => `<a class="tel" href="tel:${n.tel}"><span>${esc(n.label)}</span><b>${esc(n.tel)}</b></a>`).join('')}</div>`;
}

/* ---------- Meine Codes (nur lokal) ---------- */
function renderCodes(main) {
  const c = store.get('codes', {});
  const field = (key, label, type = 'text', ph = '') => `<label class="field"><span>${esc(label)}</span>
    <div class="row"><input class="grow" type="${type}" data-code="${key}" value="${esc(c[key] || '')}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false">
    ${c[key] && type !== 'password' ? `<button class="btn small ghost" data-copy="${esc(c[key])}">Kopieren</button>` : ''}</div></label>`;
  main.innerHTML = `<div class="card alert small">Diese Daten bleiben nur in diesem Browser auf diesem Handy. Sie stehen nicht in trip.json, nicht im Internet und werden beim Abgleich nicht mitgeschickt. Auf jedem Handy einmal ausfüllen.</div>
    <div class="card">${trip.codeFields.map(f => field(f.key, f.label)).join('')}</div>
    <h2>KI-Vorschläge (optional)</h2>
    <div class="card small">Entweder eigener Proxy (empfohlen, Schlüssel bleibt geheim) oder Claude-API-Schlüssel direkt. Siehe README.</div>
    <div class="card">${field('proxyUrl', 'Proxy-URL (Cloudflare Worker)', 'url', 'https://…workers.dev')}${field('proxyToken', 'Proxy-Passwort', 'password')}${field('apiKey', 'ODER Claude-API-Schlüssel', 'password', 'sk-ant-…')}</div>
    <h2>Veröffentlichen auf GitHub (optional)</h2>
    <div class="card small">Damit „Reisedaten bearbeiten“ direkt veröffentlichen kann. Schlüssel: GitHub → Settings → Developer settings → Fine-grained tokens, nur dieses Repository, Recht „Contents: Read and write“.</div>
    <div class="card">${field('ghRepo', 'Repository (name/repo)', 'text', 'name/thailand-2026')}${field('ghToken', 'GitHub-Schlüssel', 'password', 'github_pat_…')}</div>
    <div class="card"><button class="btn danger block" id="wipeCodes">Alle Codes auf diesem Handy löschen</button></div>`;
  main.addEventListener('change', e => {
    const i = e.target.closest('[data-code]');
    if (!i) return;
    const all = store.get('codes', {}); all[i.dataset.code] = i.value.trim(); store.set('codes', all); toast('Gespeichert');
  });
  $('#wipeCodes').addEventListener('click', e => { if (confirmTap(e.currentTarget, 'Nochmal tippen zum Löschen')) { store.del('codes'); rerender(); } });
}

/* ---------- Abgleich zwischen zwei Handys (ohne Server) ---------- */
function renderSync(main) {
  main.innerHTML = `<div class="card"><h3>So gleicht ihr ab</h3>
    <ol style="padding-left:20px;margin:0"><li>Handy A: „Daten senden“ → per WhatsApp/AirDrop an Handy B.</li>
    <li>Handy B: Datei speichern, hier „Daten empfangen“ und die Datei wählen.</li>
    <li>Danach umgekehrt, wenn beide etwas eingetragen haben.</li></ol>
    <p class="small">Zusammengeführt werden Ausgaben, Haken, gewählte Pläne und Tagestausch. Nichts wird doppelt. Codes und Dokumente bleiben auf dem Handy.</p>
    <div class="btns"><button class="btn" id="exp">⬆︎ Daten senden</button><label class="btn ghost">⬇︎ Daten empfangen<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <div class="card"><h3>Alles offline laden</h3>
      <p class="small">Vor dem Abflug einmal im WLAN antippen: lädt App, Karte fürs Pilotenspiel, Wetter, Bilder und Infos zu allen Orten und das Tagebuch.</p>
      <div class="btns"><button class="btn" id="preload">⬇︎ Jetzt alles laden</button></div>
      <p class="small" id="preloadMsg">${(() => { const o = store.get('offlineReady', null); return o ? `✓ Zuletzt geladen ${wxStamp(o.t).replace('Stand ', '')} (${esc(o.steps.join(', '))})` : 'Noch nicht geladen.'; })()}</p></div>
    <div class="card"><h3>Hintergrundbild</h3>
      <p class="small">Eigenes Urlaubsfoto als Hintergrund – bleibt nur auf diesem Handy.</p>
      <div class="btns"><label class="btn ghost">🖼️ Foto wählen<input type="file" id="bgFile" accept="image/*" hidden></label><button class="btn ghost" id="bgReset">Standardbild</button></div></div>
    <div class="card"><h3>Kalender</h3>
      <p class="small">Alle Termine und Erinnerungen (Einreisekarte, Check-ins, Grab, Flüge) mit Wecker als Kalenderdatei. Am iPhone in Safari öffnen und „Alle hinzufügen“ wählen.</p>
      <div class="btns"><button class="btn ghost" data-ics>📅 Termine in den Kalender</button></div></div>
    <div class="card"><h3>App-Daten</h3><p class="small">Reisedaten-Stand: ${esc(trip.meta.stand)} · Wetter: ${esc(wxStampShort())}</p>
      <div class="btns"><button class="btn ghost" id="reloadTrip">Reisedaten neu laden</button></div></div>
    <div class="card"><h3>Alles zurücksetzen</h3><p class="small">Löscht Ausgaben, Haken, Pläne und Codes auf diesem Handy.</p><button class="btn danger" id="reset">Zurücksetzen</button></div>`;
  $('#bgFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const { blob } = await shrinkPhoto(f, 1800); await docsDb.put({ id: 'bg', slot: '_bg', name: 'Hintergrund', type: 'image/jpeg', blob }); applyBg(); toast('Hintergrund gesetzt'); }
    catch { toast('Bild ließ sich nicht speichern'); }
  });
  $('#bgReset').addEventListener('click', async () => { await docsDb.del('bg').catch(() => {}); applyBg(); toast('Standardbild'); });
  $('#preload').addEventListener('click', async e => {
    if (!navigator.onLine) return toast('Dafür braucht es Internet');
    e.currentTarget.disabled = true;
    const msg = s => ($('#preloadMsg').innerHTML = `<span class="spinner"></span> ${esc(s)}`);
    const r = await preloadAll(msg);
    $('#preloadMsg').textContent = `✓ Fertig: ${r.steps.join(', ')}${r.fail ? ` – ${r.fail} Dateien fehlgeschlagen, später nochmal versuchen` : ''}. Jetzt klappt alles auch im Flugmodus.`;
    $('#preload').disabled = false;
  });
  $('#exp').addEventListener('click', () => {
    const data = { app: APP, v: 1, exported: new Date().toISOString(), expenses: store.get('expenses', []), checks: store.get('checks', {}), plans: store.get('plans', {}), swaps: store.get('swaps', {}), packExtra: store.get('packExtra', []), fx: fx(), budget: budget(), atmFee: atmFeeDefault(), cardFee: cardFeePct() };
    downloadOrShare(new Blob([JSON.stringify(data)], { type: 'application/json' }), `thailand-abgleich-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  });
  $('#imp').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== APP) throw new Error('Keine Datei dieser App');
      const n = mergeSync(d);
      toast(`Abgeglichen: ${n} neue/aktualisierte Ausgaben`);
      route();
    } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  });
  $('#reloadTrip').addEventListener('click', async () => { await loadTrip(true); toast('Reisedaten neu geladen'); route(); });
  $('#reset').addEventListener('click', e => {
    if (!confirmTap(e.currentTarget, 'Nochmal tippen zum Löschen')) return;
    Object.keys(localStorage).filter(k => k.startsWith(APP + '.')).forEach(k => localStorage.removeItem(k));
    route();
  });
}
function mergeSync(d) {
  let n = 0;
  const mine = new Map(store.get('expenses', []).map(e => [e.id, e]));
  for (const e of d.expenses || []) {
    const m = mine.get(e.id);
    if (!m || (e.updated || 0) > (m.updated || 0)) { mine.set(e.id, e); n++; }
  }
  store.set('expenses', [...mine.values()]);
  const newer = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b || {})) if (!out[k] || (v?.t || 0) > (out[k]?.t || 0)) out[k] = v; return out; };
  store.set('checks', newer(store.get('checks', {}), d.checks));
  store.set('plans', newer(store.get('plans', {}), d.plans));
  if ((d.swaps?._t || 0) > (store.get('swaps', {})._t || 0)) store.set('swaps', d.swaps);
  store.set('packExtra', [...new Set([...store.get('packExtra', []), ...(d.packExtra || [])])]);
  return n;
}

/* ---------- Mehr ---------- */
function renderMore(main) {
  if (isGuest()) {
    main.innerHTML = `<div class="tiles">${tile('#/fluege', '✈️', 'Flüge', 'Zeiten')}${tile('#/woerter', '🗣️', 'Thai-Sprachführer', 'zum Mitreden')}</div>
      <div class="card small">Ihr seht den Reiseplan von ${esc(trip.meta.travelers)}. Uhrzeiten in Ortszeit, Thailand ist im November 6 Stunden voraus.</div>
      <div class="pad"><button class="btn ghost" id="logout">Abmelden</button></div>`;
    $('#logout').addEventListener('click', logout);
    return;
  }
  const groups = [
    ['Unterwegs', [['fluege', '✈️', 'Flüge', 'Check-in & Gepäck'], ['unterkuenfte', '🏠', 'Unterkünfte', 'Adressen & Zeiten'], ['transfers', '🚗', 'Transfers', 'Grab, Boot, Flug'],
      ['essen', '🍜', 'Essen', 'geprüfte Restaurants'], ['ideen', '🏝️', 'Unternehmungen', 'Ideen je Ort'], ['woerter', '🗣️', 'Thai-Sprachführer', 'Sätze, Tisch reservieren']]],
    ['Familie', [['lernen', '📚', 'Lernen', 'Englisch & Mathe'], ['kinder', '🧸', 'Für die Kinder', 'Spiele & Geschichten'], ['tagebuch', '📸', 'Tagebuch', 'auch für Gäste'], ['gaeste', '👀', 'Gäste-Zugang', 'Link & Passwort']]],
    ['Sicher & privat', [['notfall', '🆘', 'Notfall', 'Ärzte & Kliniken'], ['dokumente', '🎫', 'Dokumente', 'nur auf diesem Handy'], ['codes', '🔒', 'Meine Codes', 'nur auf diesem Handy']]],
    ['Einstellungen', [['abgleich', '⇄', 'Abgleich & Offline', 'Kalender, Hintergrund'], ['bearbeiten', '✏️', 'Reisedaten bearbeiten', 'für alle veröffentlichen']]]
  ];
  main.innerHTML = groups.map(([g, list]) => `<h2>${esc(g)}</h2><div class="sheet">${list.map(([h, i, l, s2]) => `<a href="#/${h}"><span class="qi">${i}</span><span class="grow"><b>${esc(l)}</b><span class="small muted">${esc(s2)}</span></span><span class="chev">›</span></a>`).join('')}</div>`).join('') +
    `<p class="pad small">Reisedaten Stand ${esc(trip.meta.stand)}. Alles mit „zu prüfen“ ist ohne Buchungsbestätigung.</p>
    <div class="pad"><button class="btn ghost" id="logout">Abmelden</button></div>`;
  $('#logout').addEventListener('click', logout);
}

/* ---------- Essen: vorausgewählte Restaurants je Ort ---------- */
function renderFood(main) {
  const f = trip.food;
  if (!f) { main.innerHTML = '<div class="card">Noch keine Restaurants hinterlegt.</div>'; return; }
  const here = calendarDay(today().date)?.place === 'samet' ? 'samet' : 'bkk';
  const order = [...new Set([here, ...f.places.map(r => r.place)])].filter(pl => f.places.some(r => r.place === pl));
  const card = r => `<div class="card">
      <b>${esc(r.name)}</b>
      <div><span class="badge ${/Michelin/.test(r.badge) ? 'ok' : ''}">${esc(r.badge)}</span></div>
      <div class="small muted">${esc(r.type)} · ${esc(r.area)} · ${esc(r.price)}${r.hours ? ' · ' + esc(r.hours) : ''}</div>
      <div style="margin-top:6px">${esc(r.dishes)}</div>
      <div class="small">🧒 ${esc(r.kids)}</div>
      ${r.note ? `<div class="small">${esc(r.note)}</div>` : ''}${r.check ? ' <span class="badge warn">zu prüfen</span>' : ''}
      <div class="btns"><a class="btn small" href="${mapsUrl(r.maps)}" target="_blank" rel="noopener">📍 Karte & Bewertungen</a>
        <a class="btn small ghost" href="${photosUrl(r.maps)}" target="_blank" rel="noopener">📷 Fotos</a></div></div>`;
  main.innerHTML = `<div class="card small">Ausgewählt nach Michelin Guide und gut bewerteten Häusern, nur mit Sitzplätzen oder gut zum Mitnehmen. Bewertungen ändern sich – vor dem Besuch kurz in Google Maps reinschauen.</div>
    <div class="btns pad"><a class="btn" href="${mapsUrl('Restaurant')}" target="_blank" rel="noopener">🍽️ Restaurants in der Nähe</a></div>
    ${order.map(pl => `<h2>${esc(trip.places[pl].name)}${pl === here ? ' (ihr seid hier)' : ''}</h2>${f.places.filter(r => r.place === pl).map(card).join('')}`).join('')}
    <h2>Was Kinder meist mögen</h2><div class="card"><dl class="kv">${f.kidsDishes.map(([d, e]) => `<dt><b>${esc(d)}</b></dt><dd style="font-weight:400">${esc(e)}</dd>`).join('')}</dl>
      <p class="small" style="margin-bottom:0">„Mai phet“ = nicht scharf. Mehr unter <a href="#/woerter">Thai-Wörter</a>.</p></div>
    <h2>Gegen Bauchweh</h2><div class="card"><ul style="margin:0;padding-left:20px">${f.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <h2>Bewusst nicht dabei</h2><div class="card">${f.excluded.map(([n, why]) => `<p class="small"><b>${esc(n)}</b>: ${esc(why)}</p>`).join('')}</div>
    <p class="pad small muted">Quellen: ${esc(f.sources)}</p>`;
}

/* ---------- Thai-Sprachführer ---------- */
/* p = Höflichkeitswort anhängen (Mann: khrap, Frau: kha), q = Frage (Frau dann „khá“ statt „khâ“) */
const PHRASEBOOK = [
  ['👋 Grundlagen', [
    { de: 'Hallo / Tschüss', th: 'สวัสดี', tr: 'sa-wat-dii', p: 1 },
    { de: 'Danke', th: 'ขอบคุณ', tr: 'khop-khun', p: 1 },
    { de: 'Entschuldigung', th: 'ขอโทษ', tr: 'khoo-thoot', p: 1 },
    { de: 'Kein Problem / macht nichts', th: 'ไม่เป็นไร', tr: 'mai pen rai' },
    { de: 'Ja, genau', th: 'ใช่', tr: 'chai' },
    { de: 'Nein', th: 'ไม่ใช่', tr: 'mai chai' },
    { de: 'Ich verstehe nicht', th: 'ไม่เข้าใจ', tr: 'mai khao-djai', p: 1 },
    { de: 'Sprechen Sie Englisch?', th: 'พูดภาษาอังกฤษได้ไหม', tr: 'puut phaa-saa ang-grit dai mai', p: 1, q: 1 },
    { de: 'Wie viel kostet das?', th: 'อันนี้เท่าไหร่', tr: 'an-nii thao-rai', p: 1, q: 1 },
    { de: 'Zu teuer', th: 'แพงไป', tr: 'phaeng pai' },
    { de: 'Geht es etwas billiger?', th: 'ลดได้ไหม', tr: 'lot dai mai', p: 1, q: 1 }
  ]],
  ['🍽️ Restaurant & Tisch', [
    { de: 'Einen Tisch für vier Personen, bitte', th: 'ขอโต๊ะสำหรับสี่คน', tr: 'khoo to sam-rap sii khon', p: 1 },
    { de: 'Zwei Erwachsene und zwei Kinder', th: 'ผู้ใหญ่สองคน เด็กสองคน', tr: 'phuu-yai soong khon, dek soong khon' },
    { de: 'Wir haben reserviert', th: 'จองไว้แล้ว', tr: 'djong wai laeo', p: 1 },
    { de: 'Haben Sie einen Kinderstuhl?', th: 'มีเก้าอี้เด็กไหม', tr: 'mii kao-ii dek mai', p: 1, q: 1 },
    { de: 'Die Speisekarte, bitte', th: 'ขอเมนูหน่อย', tr: 'khoo me-nuu noi', p: 1 },
    { de: 'Nicht scharf, bitte', th: 'ไม่เผ็ด', tr: 'mai phet', p: 1 },
    { de: 'Für die Kinder überhaupt nicht scharf', th: 'สำหรับเด็ก ไม่เผ็ดเลย', tr: 'sam-rap dek, mai phet loei', p: 1 },
    { de: 'Nur ein bisschen scharf', th: 'เผ็ดนิดหน่อย', tr: 'phet nit-noi', p: 1 },
    { de: 'Wasser (Flasche)', th: 'น้ำเปล่า', tr: 'nam plao' },
    { de: 'Ohne Eis', th: 'ไม่ใส่น้ำแข็ง', tr: 'mai sai nam-khaeng', p: 1 },
    { de: 'Sehr lecker!', th: 'อร่อยมาก', tr: 'a-roi maak', p: 1 },
    { de: 'Zum Mitnehmen', th: 'ห่อกลับบ้าน', tr: 'hoo glap baan', p: 1 },
    { de: 'Die Rechnung, bitte', th: 'เช็คบิล', tr: 'chek bin', p: 1 },
    { de: 'Kann ich mit Karte zahlen?', th: 'จ่ายด้วยบัตรได้ไหม', tr: 'djaai duai bat dai mai', p: 1, q: 1 }
  ]],
  ['🧒 Was Kinder gern essen', [
    { de: 'Gebratener Reis mit Huhn', th: 'ข้าวผัดไก่', tr: 'khao phat gai' },
    { de: 'Frittiertes Hähnchen', th: 'ไก่ทอด', tr: 'gai thot' },
    { de: 'Thai-Omelett', th: 'ไข่เจียว', tr: 'khai djiao' },
    { de: 'Reis pur', th: 'ข้าวสวย', tr: 'khao suai' },
    { de: 'Huhn mit Reis', th: 'ข้าวมันไก่', tr: 'khao man gai' },
    { de: 'Mango mit Klebreis', th: 'ข้าวเหนียวมะม่วง', tr: 'khao niao ma-muang' },
    { de: 'Frischer Fruchtshake', th: 'น้ำปั่น', tr: 'nam pan' }
  ]],
  ['🚗 Unterwegs, Grab & Boot', [
    { de: 'Wo ist die Toilette?', th: 'ห้องน้ำอยู่ที่ไหน', tr: 'hong-naam yuu thii-nai', p: 1, q: 1 },
    { de: 'Bitte hier anhalten', th: 'จอดตรงนี้', tr: 'djoot trong-nii', p: 1 },
    { de: 'Bitte langsam fahren', th: 'ขับช้าๆ หน่อย', tr: 'khap chaa chaa noi', p: 1 },
    { de: 'Wann fährt das Boot nach Koh Samet?', th: 'เรือไปเกาะเสม็ดกี่โมง', tr: 'ruea pai ko sa-met kii moong', p: 1, q: 1 },
    { de: 'Vier Tickets, bitte', th: 'ขอตั๋วสี่ใบ', tr: 'khoo tua sii bai', p: 1 },
    { de: 'Bootsanleger', th: 'ท่าเรือ', tr: 'thaa ruea' }
  ]],
  ['🏨 Unterkunft', [
    { de: 'Wir haben ein Zimmer reserviert', th: 'จองห้องไว้แล้ว', tr: 'djong hong wai laeo', p: 1 },
    { de: 'Die Klimaanlage geht nicht', th: 'แอร์เสีย', tr: 'ae sia', p: 1 },
    { de: 'Noch zwei Handtücher, bitte', th: 'ขอผ้าเช็ดตัวเพิ่มสองผืน', tr: 'khoo phaa chet tua phoem soong phuen', p: 1 }
  ]],
  ['🆘 Notfall & Gesundheit', [
    { de: 'Hilfe!', th: 'ช่วยด้วย', tr: 'chuai duai' },
    { de: 'Ich brauche einen Arzt', th: 'ต้องการหมอ', tr: 'tong-gaan moo', p: 1 },
    { de: 'Krankenhaus', th: 'โรงพยาบาล', tr: 'roong pha-yaa-baan' },
    { de: 'Apotheke', th: 'ร้านขายยา', tr: 'raan khaai yaa' },
    { de: 'Mein Kind ist krank', th: 'ลูกไม่สบาย', tr: 'luuk mai sa-baai', p: 1 },
    { de: 'Es hat Fieber', th: 'เป็นไข้', tr: 'pen khai' },
    { de: 'Mein Kind ist verloren gegangen', th: 'ลูกหาย', tr: 'luuk haai', p: 1 }
  ]]
];
const NUMBERS = [['1', 'หนึ่ง', 'nueng'], ['2', 'สอง', 'soong'], ['3', 'สาม', 'saam'], ['4', 'สี่', 'sii'], ['5', 'ห้า', 'haa'], ['6', 'หก', 'hok'], ['7', 'เจ็ด', 'djet'],
  ['8', 'แปด', 'paet'], ['9', 'เก้า', 'gao'], ['10', 'สิบ', 'sip'], ['20', 'ยี่สิบ', 'yii-sip'], ['50', 'ห้าสิบ', 'haa-sip'], ['100', 'ร้อย', 'roi'], ['1000', 'พัน', 'phan']];
function politeTh(ph, sex) { return ph.p ? ph.th + (sex === 'f' ? (ph.q ? 'คะ' : 'ค่ะ') : 'ครับ') : ph.th; }
function politeTr(ph, sex) { return ph.p ? `${ph.tr} ${sex === 'f' ? 'kha' : 'khrap'}` : ph.tr; }
function speakTh(text) {
  if (!('speechSynthesis' in window)) return toast('Vorlesen geht hier nicht');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'th-TH'; u.rate = 0.8;
  if (!speechSynthesis.getVoices().some(v => v.lang.startsWith('th'))) toast('Keine Thai-Stimme auf dem Handy – Aussprache steht dabei');
  speechSynthesis.speak(u);
}
function showBig(th, de, tr) {
  const ov = document.createElement('div');
  ov.className = 'overlay showcard';
  ov.innerHTML = `<div><div class="th">${esc(th)}</div><div class="tr">${esc(tr || '')}</div><div class="de">${esc(de)}</div>
    <div class="btns" style="justify-content:center"><button class="btn" data-say>🔊 Abspielen</button><button class="btn ghost" data-close>Schließen</button></div></div>`;
  ov.addEventListener('click', e => { if (e.target.closest('[data-say]')) return speakTh(th); ov.remove(); });
  document.body.append(ov);
}
function renderWords(main) {
  const sex = store.get('thSex', 'm');
  const rv = store.get('resv', { n: 4, kids: 2, time: '19:00', when: 'heute' });
  const resv = () => {
    const whenTh = rv.when === 'heute' ? 'คืนนี้' : 'พรุ่งนี้', whenEn = rv.when === 'heute' ? 'tonight' : 'tomorrow';
    const pS = sex === 'f' ? 'ค่ะ' : 'ครับ', pQ = sex === 'f' ? 'คะ' : 'ครับ';
    const adults = rv.n - rv.kids;
    return {
      th: `สวัสดี${pS} ขอจองโต๊ะสำหรับ ${rv.n} คน${rv.kids ? ` (ผู้ใหญ่ ${adults} คน เด็ก ${rv.kids} คน)` : ''} ${whenTh} เวลา ${rv.time.replace(':', '.')} น.${rv.kids ? ` มีเก้าอี้เด็กไหม${pQ}` : ''} ขอบคุณ${pS}`,
      en: `Hello, I'd like to reserve a table for ${rv.n} people${rv.kids ? ` (${adults} adults, ${rv.kids} children)` : ''} ${whenEn} at ${rv.time}.${rv.kids ? ' Do you have a high chair?' : ''} Thank you!`
    };
  };
  const r = resv();
  main.innerHTML = `<div class="card small">Antippen zeigt den Satz groß auf Thai – zum Vorzeigen beim Kellner oder Fahrer. 🔊 spielt ihn ab, wenn das Handy eine Thai-Stimme hat.
      <div class="seg" style="margin:10px 0 0"><span style="align-self:center">Ich spreche als</span>
      <button type="button" class="chip ${sex === 'm' ? 'on' : ''}" data-sex="m">Mann (khrap)</button><button type="button" class="chip ${sex === 'f' ? 'on' : ''}" data-sex="f">Frau (kha)</button></div></div>
    <h2>📞 Tisch reservieren</h2>
    <div class="card">
      <div class="grid2">
        <label class="field"><span>Personen</span><input id="rvN" type="number" min="1" max="20" value="${rv.n}" inputmode="numeric"></label>
        <label class="field"><span>davon Kinder</span><input id="rvK" type="number" min="0" max="10" value="${rv.kids}" inputmode="numeric"></label>
        <label class="field"><span>Uhrzeit</span><input id="rvT" type="time" value="${rv.time}"></label>
        <div class="field"><span class="small muted" style="display:block;margin-bottom:4px">Wann</span><div class="seg" style="margin:0">
          <button type="button" class="chip ${rv.when === 'heute' ? 'on' : ''}" data-when="heute">heute</button><button type="button" class="chip ${rv.when === 'morgen' ? 'on' : ''}" data-when="morgen">morgen</button></div></div>
      </div>
      <p class="th-inline">${esc(r.th)}</p>
      <p class="small">${esc(r.en)}</p>
      <div class="btns"><button class="btn" id="rvShow">Groß zeigen</button><button class="btn ghost" data-copy="${esc(r.en + '\n' + r.th)}">Für Nachricht kopieren</button></div>
      <p class="small muted" style="margin-bottom:0">Viele Restaurants verstehen die englische Fassung per WhatsApp oder Telefon.</p></div>
    ${PHRASEBOOK.map(([cat, list]) => `<h2>${esc(cat)}</h2><div class="card phrases">${list.map((ph, i) => `
      <button type="button" class="phrase" data-ph="${esc(cat)}|${i}"><span class="de">${esc(ph.de)}</span><span class="th">${esc(politeTh(ph, sex))}</span><span class="tr">${esc(politeTr(ph, sex))}</span></button>`).join('')}</div>`).join('')}
    <h2>🔢 Zahlen</h2><div class="card"><div class="numgrid">${NUMBERS.map(([n, th, tr]) => `<button type="button" class="phrase" data-num="${n}|${th}|${tr}"><span class="th">${th}</span><span class="tr"><b>${n}</b> · ${tr}</span></button>`).join('')}</div>
      <p class="small muted" style="margin-bottom:0">Preise stehen fast immer in normalen Ziffern da.</p></div>
    <p class="pad small">Höflich wird es mit „khrap“ (Männer) oder „kha“ (Frauen) am Satzende. Die Sätze habe ich aus eigenem Sprachwissen zusammengestellt; sie sind nicht von Muttersprachlern geprüft.</p>`;
  const saveRv = () => { store.set('resv', rv); rerender(); };
  $('#rvN').addEventListener('change', e => { rv.n = Math.max(1, +e.target.value || 1); rv.kids = Math.min(rv.kids, rv.n); saveRv(); });
  $('#rvK').addEventListener('change', e => { rv.kids = Math.min(rv.n, Math.max(0, +e.target.value || 0)); saveRv(); });
  $('#rvT').addEventListener('change', e => { if (e.target.value) { rv.time = e.target.value; saveRv(); } });
  $('#rvShow').addEventListener('click', () => showBig(r.th, r.en, ''));
  main.addEventListener('click', e => {
    const sx = e.target.closest('[data-sex]'); if (sx) { store.set('thSex', sx.dataset.sex); return rerender(); }
    const w = e.target.closest('[data-when]'); if (w) { rv.when = w.dataset.when; return saveRv(); }
    const b = e.target.closest('[data-ph]');
    if (b) { const [cat, i] = b.dataset.ph.split('|'); const ph = PHRASEBOOK.find(c => c[0] === cat)[1][+i]; return showBig(politeTh(ph, sex), ph.de, politeTr(ph, sex)); }
    const n = e.target.closest('[data-num]'); if (n) { const [num, th, tr] = n.dataset.num.split('|'); showBig(th, num, tr); }
  });
}

/* ---------- Gäste-Zugang ---------- */
function renderGuests(main) {
  const link = location.origin + location.pathname;
  const pass = trip.meta.viewerPass || '';
  const msg = `Unsere Thailand-Reise zum Mitverfolgen: ${link}\nPasswort: ${pass}`;
  main.innerHTML = `<div class="card"><p>Freunde und Familie sehen mit dem Gäste-Passwort den Tagesplan, die Orte, das Wetter und die Flugzeiten.</p>
    <p class="small">Nicht sichtbar für Gäste: Unterkünfte, Adressen, Gastgeber, Ausgaben, Listen, Dokumente, Codes.</p>
    <dl class="kv"><dt>Link</dt><dd style="word-break:break-all">${esc(link)}</dd><dt>Passwort</dt><dd class="code">${esc(pass)}</dd></dl>
    <div class="btns"><button class="btn" data-copy="${esc(msg)}">Nachricht kopieren</button></div></div>
    <div class="card small">Passwort ändern: unter <a href="#/bearbeiten">Reisedaten bearbeiten</a> den Wert bei <code>viewerPass</code> ändern und veröffentlichen. Danach kommen alte Gäste nicht mehr rein.</div>`;
}

/* ---------- Reisedaten bearbeiten: verschlüsseln und veröffentlichen ---------- */
function renderEdit(main) {
  const c = store.get('codes', {});
  const { role, ...plain } = trip;
  const canPublish = c.ghRepo && c.ghToken;
  main.innerHTML = `<div class="card small">Änderungen hier gelten nach dem Veröffentlichen für alle. Die Familienfassung wird mit eurem Passwort verschlüsselt, die Gästefassung mit dem Gäste-Passwort (<code>meta.viewerPass</code>).</div>
    <div class="card">
      <textarea id="tripJson" spellcheck="false" autocapitalize="off" style="min-height:55vh;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace">${esc(JSON.stringify(plain, null, 2))}</textarea>
      <label class="field"><span>Neues Familien-Passwort (leer lassen = bleibt)</span><input id="newPass" autocomplete="new-password" autocapitalize="off"></label>
      <div class="btns">
        <button class="btn" id="publish" ${canPublish ? '' : 'disabled'}>Veröffentlichen</button>
        <button class="btn ghost" id="shareFiles">Als Dateien teilen</button>
      </div>
      <p class="small" id="editMsg">${canPublish ? `Ziel: GitHub ${esc(c.ghRepo)}` : 'Zum direkten Veröffentlichen Repository und GitHub-Schlüssel unter <a href="#/codes">Meine Codes</a> eintragen. Sonst „Als Dateien teilen“ und beide Dateien auf GitHub im Ordner data ersetzen.'}</p>
    </div>`;
  const msg = t => ($('#editMsg').innerHTML = t);
  const parse = () => {
    let obj;
    try { obj = JSON.parse($('#tripJson').value); }
    catch (e) { msg(`<b>Fehler im Text:</b> ${esc(e.message)}. Meist fehlt ein Komma oder Anführungszeichen.`); return null; }
    if (!obj.meta?.start || !Array.isArray(obj.days) || !Array.isArray(obj.stays)) { msg('<b>Fehler:</b> meta, days oder stays fehlen.'); return null; }
    if (!obj.meta.viewerPass || obj.meta.viewerPass.length < 8) { msg('<b>Fehler:</b> meta.viewerPass (Gäste-Passwort) fehlt oder ist zu kurz.'); return null; }
    return obj;
  };
  const build = async obj => {
    const famPass = $('#newPass').value.trim() || store.get('session', {}).pass;
    const fam = await TripShared.encryptJson({ ...obj, role: 'familie' }, famPass);
    const guest = await TripShared.encryptJson(TripShared.guestData(obj), obj.meta.viewerPass);
    return { famPass, files: { [FILES.familie]: JSON.stringify(fam), [FILES.gast]: JSON.stringify(guest) } };
  };
  const adopt = (obj, famPass) => {
    trip = { ...obj, role: 'familie' };
    store.set('tripCache', trip);
    store.set('session', { pass: famPass, role: 'familie' });
  };
  $('#publish').addEventListener('click', async e => {
    const obj = parse(); if (!obj) return;
    e.currentTarget.disabled = true;
    msg('<span class="spinner"></span> Verschlüssele und lade hoch …');
    try {
      const { famPass, files } = await build(obj);
      const oldGuestPass = trip.meta.viewerPass;
      if (obj.meta.viewerPass !== oldGuestPass) {
        const remote = await diaryRemote(c, oldGuestPass);
        if (remote.sha) files[FILES.diary] = JSON.stringify(await TripShared.encryptJson(remote.index, obj.meta.viewerPass));
      }
      for (const [path, content] of Object.entries(files)) await ghPut(c.ghRepo, c.ghToken, path, content);
      store.del('diaryCache');
      adopt(obj, famPass);
      msg('✓ Veröffentlicht. In 1–2 Minuten sehen alle die neue Fassung.');
    } catch (err) { msg(`<b>Hochladen fehlgeschlagen:</b> ${esc(err.message)}`); }
    $('#publish').disabled = false;
  });
  $('#shareFiles').addEventListener('click', async () => {
    const obj = parse(); if (!obj) return;
    msg('<span class="spinner"></span> Verschlüssele …');
    const { famPass, files } = await build(obj);
    const list = Object.entries(files).map(([p, c2]) => new File([c2], p.split('/').pop(), { type: 'application/json' }));
    adopt(obj, famPass);
    if (navigator.canShare?.({ files: list })) { try { await navigator.share({ files: list }); } catch {} }
    else list.forEach(f => downloadOrShare(f, f.name));
    msg('Beide Dateien auf GitHub im Ordner <code>data</code> hochladen und die alten ersetzen.');
  });
}
const ghHeaders = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' });
async function ghGet(repo, token, path) {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders(token), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}
async function ghPutB64(repo, token, path, b64, message, sha) {
  if (sha === undefined) sha = (await ghGet(repo, token, path))?.sha;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: 'PUT', headers: { ...ghHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify({ message, content: b64, sha: sha || undefined }) });
  if (!r.ok) { const err = new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`); err.status = r.status; throw err; }
}
function ghPut(repo, token, path, content) { return ghPutB64(repo, token, path, btoa(content), `Reisedaten aktualisiert (${path})`); }
async function ghDelete(repo, token, path) {
  const f = await ghGet(repo, token, path);
  if (!f) return;
  await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: 'DELETE', headers: { ...ghHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify({ message: `Foto gelöscht`, sha: f.sha }) });
}

/* ---------- Kalender (.ics) mit Erinnerungen ---------- */
function icsDate(iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m); }
function icsFold(line) {
  const out = []; let s = line;
  while (s.length > 70) { out.push(s.slice(0, 70)); s = ' ' + s.slice(70); }
  out.push(s); return out.join('\r\n');
}
function buildIcs() {
  const stamp = icsDate(new Date().toISOString());
  const ev = (trip.calendar || []).map(c => {
    const end = c.end || new Date(new Date(c.start).getTime() + (c.min || 30) * 60000).toISOString();
    return ['BEGIN:VEVENT', `UID:${c.id}@thailand-2026`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(c.start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(c.title)}`, c.location ? `LOCATION:${icsText(c.location)}` : '', c.note ? `DESCRIPTION:${icsText(c.note)}` : '',
      ...(c.alarms || []).flatMap(m => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(c.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM']),
      'END:VEVENT'].filter(Boolean).map(icsFold).join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Thailand 2026//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Thailand 2026', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-ics]')) return;
  if (!trip.calendar?.length) return toast('Keine Termine hinterlegt');
  downloadOrShare(new Blob([buildIcs()], { type: 'text/calendar' }), 'thailand-2026.ics');
  toast(`${trip.calendar.length} Termine – im Kalender „Alle hinzufügen“ wählen`);
});

/* ---------- Alles offline laden ---------- */
async function preloadAll(progress) {
  const steps = [], fail = [];
  const shell = ['./', 'index.html', 'styles.css', 'shared.js', 'app.js', 'kids-map.js', 'bg.svg', 'manifest.webmanifest', FILES.familie, FILES.gast, FILES.diary,
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
  progress('App-Dateien …');
  for (const u of shell) { try { await fetch(u, { cache: 'reload' }); } catch { fail.push(u); } }
  steps.push('App');
  progress('Wetter …');
  if (await loadWeather(true)) steps.push('Wetter');
  const items = [...Object.values(trip.ideas || {}).flat(), ...trip.days.flatMap(d => [d.planA, ...(d.planB || [])].flatMap(p => p.items))];
  const seen = new Set(), jobs = [];
  for (const it of items) {
    const q = wikiTerm(it) || it.maps;
    if (!q || seen.has(q)) continue;
    seen.add(q); jobs.push(it);
  }
  let n = 0, imgs = 0;
  for (const it of jobs) {
    progress(`Bilder & Infos ${++n} von ${jobs.length} …`);
    const term = wikiTerm(it);
    const [w, gal] = await Promise.all([term ? loadWiki(term) : null, loadCommons(term || it.maps)]);
    const urls = [...(gal || []).map(g => g.thumb), w?.img].filter(Boolean);
    await Promise.all(urls.map(u => fetch(u, { mode: 'no-cors' }).then(() => imgs++).catch(() => {})));
  }
  steps.push(`${imgs} Bilder`);
  if (!isGuest()) {
    progress('Tagebuch …');
    const idx = await loadDiary();
    for (const en of idx.entries || []) for (const ph of en.photos) { try { await fetch(ph.f); } catch {} }
  }
  const stamp = { t: Date.now(), steps, fail: fail.length };
  store.set('offlineReady', stamp);
  return stamp;
}

/* ---------- Tagebuch: Fotos & Texte, verschlüsselt mit dem Gäste-Passwort ---------- */
/* Das Inhaltsverzeichnis (data/tagebuch.enc.json) ist mit dem Gäste-Passwort verschlüsselt und enthält
   einen zufälligen Fotoschlüssel; jedes Foto liegt damit verschlüsselt in data/fotos/. */
const photoUrls = {};
function diaryPass() { return isGuest() ? store.get('session', {}).pass : trip.meta.viewerPass; }
async function loadDiary() {
  try {
    const r = await fetch(FILES.diary, { cache: 'no-cache' });
    if (r.status === 404) return store.get('diaryCache', { entries: [] });
    const index = await TripShared.decryptJson(await r.json(), diaryPass());
    const local = store.get('diaryCache', null);
    // gerade Hochgeladenes ist bei GitHub Pages erst nach 1–2 Minuten da
    if (local && (local.entries || []).length > index.entries.length && local.t > Date.now() - 10 * 60000) return local;
    store.set('diaryCache', { ...index, t: Date.now() });
    return index;
  } catch { return store.get('diaryCache', { entries: [] }); }
}
async function diaryRemote(c, pass) {
  const f = await ghGet(c.ghRepo, c.ghToken, FILES.diary);
  if (!f) return { index: { photoKey: null, entries: [] }, sha: null };
  const box = JSON.parse(atob(f.content.replace(/\s/g, '')));
  return { index: await TripShared.decryptJson(box, pass), sha: f.sha };
}
async function shrinkPhoto(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild nicht lesbar')); i.src = URL.createObjectURL(file); }); }
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  // über die Leinwand gehen auch GPS-Ortsdaten und andere Metadaten verloren
  return { blob: await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82)), w: cv.width, h: cv.height };
}
async function addDiaryEntry({ date, caption, files }, progress) {
  const c = store.get('codes', {});
  const pass = trip.meta.viewerPass;
  let { index } = await diaryRemote(c, pass);
  if (!index.photoKey) index.photoKey = await TripShared.newKey();
  const key = await TripShared.importKey(index.photoKey);
  const photos = [];
  for (const [i, f] of files.entries()) {
    progress(`Foto ${i + 1} von ${files.length} wird verkleinert und hochgeladen …`);
    const { blob, w, h } = await shrinkPhoto(f);
    const enc = await TripShared.encryptBytes(key, new Uint8Array(await blob.arrayBuffer()));
    const path = `data/fotos/${uid()}.bin`;
    await ghPutB64(c.ghRepo, c.ghToken, path, TripShared.b64(enc), 'Foto hinzugefügt', null);
    photoUrls[path] = URL.createObjectURL(blob);
    photos.push({ f: path, w, h });
  }
  const entry = { id: uid(), date, caption, photos, ts: Date.now() };
  progress('Tagebuch wird gespeichert …');
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = attempt ? await diaryRemote(c, pass) : { index, sha: undefined };
    remote.index.photoKey ||= index.photoKey;
    remote.index.entries = [...remote.index.entries.filter(e => e.id !== entry.id), entry];
    try {
      await ghPutB64(c.ghRepo, c.ghToken, FILES.diary, btoa(JSON.stringify(await TripShared.encryptJson(remote.index, pass))), 'Tagebuch-Eintrag', remote.sha);
      store.set('diaryCache', { ...remote.index, t: Date.now() });
      return;
    } catch (e) { if (e.status !== 409 && e.status !== 422) throw e; } // das andere Handy war schneller → neu laden
  }
  throw new Error('Tagebuch konnte nicht gespeichert werden');
}
async function deleteDiaryEntry(id) {
  const c = store.get('codes', {});
  const { index, sha } = await diaryRemote(c, trip.meta.viewerPass);
  const entry = index.entries.find(e => e.id === id);
  index.entries = index.entries.filter(e => e.id !== id);
  await ghPutB64(c.ghRepo, c.ghToken, FILES.diary, btoa(JSON.stringify(await TripShared.encryptJson(index, trip.meta.viewerPass))), 'Tagebuch-Eintrag gelöscht', sha);
  store.set('diaryCache', { ...index, t: Date.now() });
  for (const p of entry?.photos || []) await ghDelete(c.ghRepo, c.ghToken, p.f).catch(() => {});
}
async function showPhoto(img, path, keyB64) {
  try {
    if (!photoUrls[path]) {
      const r = await fetch(path);
      if (!r.ok) throw new Error(r.status);
      const key = await TripShared.importKey(keyB64);
      photoUrls[path] = URL.createObjectURL(new Blob([await TripShared.decryptBytes(key, new Uint8Array(await r.arrayBuffer()))], { type: 'image/jpeg' }));
    }
    img.src = photoUrls[path];
  } catch { img.alt = 'Foto noch nicht da – in 1–2 Minuten erneut öffnen'; img.classList.add('missing'); }
}
async function renderDiary(main) {
  const c = store.get('codes', {});
  const canPost = !isGuest() && c.ghRepo && c.ghToken;
  const t = today();
  main.innerHTML = `${isGuest() ? '' : canPost ? `<div class="card hero">
      <form id="diaryForm">
        <label class="field"><span>Datum</span><input type="date" id="dDate" value="${t.date >= trip.meta.start && t.date <= trip.meta.end ? t.date : trip.meta.start}"></label>
        <label class="field"><span>Was war heute?</span><textarea id="dText" placeholder="z. B. Erster Tag am Strand, Krabben gefangen …"></textarea></label>
        <label class="btn ghost block">📷 Fotos auswählen<input type="file" id="dFiles" accept="image/*" multiple hidden></label>
        <div class="small muted" id="dCount" style="margin-top:6px">Keine Fotos gewählt</div>
        <button class="btn block" type="submit" style="margin-top:10px">Für Familie & Gäste veröffentlichen</button>
        <p class="small" id="dMsg" role="status"></p>
      </form></div>`
    : `<div class="card small">Zum Hochladen auf diesem Handy unter <a href="#/codes">Meine Codes</a> GitHub-Repository und -Schlüssel eintragen.</div>`}
    <div id="entries"><p class="pad muted"><span class="spinner"></span> Lädt …</p></div>`;
  if (canPost) {
    $('#dFiles').addEventListener('change', e => ($('#dCount').textContent = `${e.target.files.length} Foto(s) gewählt – werden auf 1600 px verkleinert, Ortsdaten entfernt`));
    $('#diaryForm').addEventListener('submit', async e => {
      e.preventDefault();
      const files = [...$('#dFiles').files], caption = $('#dText').value.trim();
      if (!files.length && !caption) { $('#dMsg').textContent = 'Text oder Fotos hinzufügen.'; return; }
      const btn = e.submitter; btn.disabled = true;
      const msg = s => ($('#dMsg').innerHTML = `<span class="spinner"></span> ${esc(s)}`);
      try { await addDiaryEntry({ date: $('#dDate').value, caption, files }, msg); toast('Veröffentlicht'); rerender(); }
      catch (err) { $('#dMsg').textContent = 'Fehlgeschlagen: ' + err.message; btn.disabled = false; }
    });
  }
  const index = await loadDiary();
  const list = [...(index.entries || [])].sort((x, y) => (y.date + y.ts).localeCompare(x.date + x.ts));
  $('#entries', main).innerHTML = list.length ? list.map(en => `<div class="card">
      <div class="row between"><b>${dayLabel(en.date, true)}</b>${canPost ? `<button class="btn small danger" data-deldiary="${en.id}">Löschen</button>` : ''}</div>
      ${en.caption ? `<p style="white-space:pre-wrap;margin:8px 0">${esc(en.caption)}</p>` : ''}
      ${en.photos.length ? `<div class="photogrid">${en.photos.map(ph => `<img data-photo="${esc(ph.f)}" alt="Urlaubsfoto" width="${ph.w}" height="${ph.h}">`).join('')}</div>` : ''}
    </div>`).join('') : `<div class="card"><p>Noch keine Einträge.</p><p class="small muted">${isGuest() ? 'Schaut abends wieder vorbei.' : 'Abends ein paar Fotos und zwei Sätze – fertig.'}</p></div>`;
  $$('img[data-photo]', main).forEach(img => showPhoto(img, img.dataset.photo, index.photoKey));
  main.addEventListener('click', async e => {
    const img = e.target.closest('img[data-photo]');
    if (img?.src) {
      const ov = document.createElement('div');
      ov.className = 'overlay'; ov.innerHTML = `<img src="${img.src}" alt="Urlaubsfoto groß">`;
      ov.addEventListener('click', () => ov.remove());
      document.body.append(ov);
    }
    const d = e.target.closest('[data-deldiary]');
    if (d && confirmTap(d, 'Wirklich löschen?')) {
      d.disabled = true;
      try { await deleteDiaryEntry(d.dataset.deldiary); toast('Gelöscht'); rerender(); }
      catch (err) { toast('Löschen fehlgeschlagen: ' + err.message); d.disabled = false; }
    }
  });
}

/* ---------- Für die Kinder: Flug-Fortschritt, Geschichten, Quiz, Memory, Spiele ---------- */
const STORIES = [
  { title: 'Gecko Gogo und die Sternschnuppe', text: `Auf der Insel Koh Samet wohnte ein kleiner Gecko namens Gogo. Er wohnte in einer Bambushütte direkt am Strand, gleich über der Lampe. Jeden Abend, wenn die Sonne ins Meer plumpste, rief Gogo laut: „Geck-ko! Geck-ko!“ Das war sein Gute-Nacht-Lied.
Eines Abends sah Gogo etwas Helles über das Meer flitzen. „Eine Sternschnuppe!“, flüsterte er. Er hatte gehört, dass man sich dann etwas wünschen darf. Aber was? Mehr Mücken zum Frühstück? Einen größeren Schwanz?
Da hörte er Kinder lachen. Eine Familie war gerade angekommen, mit Koffern voller Sand und Sonnencreme. Die Kinder bauten eine Sandburg mit einem Turm, so hoch wie Gogo zwanzigmal übereinander.
Gogo wusste plötzlich, was er sich wünschte: dass die Kinder eine wunderschöne Zeit auf seiner Insel haben. Er kletterte auf die Lampe, sah zu, wie die Sterne angingen, und rief: „Geck-ko!“
Und wenn ihr heute Abend einen Gecko hört, dann wisst ihr: Das ist Gogo, und er sagt Gute Nacht.` },
  { title: 'Das kleine Tuk-Tuk Tuki', text: `In Bangkok, der riesigen Stadt mit den goldenen Tempeln, fuhr ein kleines Tuk-Tuk namens Tuki. Tuki hatte drei Räder, ein buntes Dach und eine Hupe, die „Möp-möp!“ machte.
Die großen Busse lachten manchmal über Tuki. „Du bist so klein!“, brummten sie. Aber Tuki war schnell und wendig. Er kannte jede Gasse, jeden Markt und jede Abkürzung zum Fluss.
Eines Tages stand eine Familie am Straßenrand. Die Kinder waren müde vom langen Flug, und es war heiß. „Wir möchten zum Fluss, die Sonne untergehen sehen“, sagte die Mama. Die großen Busse steckten im Stau fest. Aber Tuki rief: „Möp-möp, steigt ein!“
Er sauste um Ecken, vorbei an Garküchen, die nach Mango und Kokos dufteten, an einem Tempel mit tausend kleinen Glöckchen. Gerade als sie am Fluss ankamen, wurde der Himmel orange und rosa, und der Tempel auf der anderen Seite leuchtete wie aus Gold.
„Danke, Tuki!“, riefen die Kinder. Und Tuki hupte ganz stolz: „Möp-möp!“` },
  { title: 'Elefant Lek kann nicht schlafen', text: `Lek war ein kleiner Elefant, der mit seiner Mama im Wald lebte. Lek heißt auf Thai „klein“, und das passte gut, denn Lek war der Kleinste in der ganzen Herde.
Eines Nachts konnte Lek nicht schlafen. Über ihm brummte etwas Großes durch die Wolken, mit blinkenden Lichtern. „Mama, was ist das?“, fragte Lek. „Das ist ein Flugzeug“, sagte Mama. „Da drin sitzen Kinder, die ganz weit weg wohnen. Sie fliegen die ganze Nacht, um unser Land zu besuchen.“
„Die ganze Nacht? Können die da drin schlafen?“, fragte Lek. „Wenn sie die Augen zumachen und an etwas Schönes denken“, sagte Mama, „an warmes Meer, an Muscheln und an Mangos.“
Lek machte die Augen zu. Er dachte ans warme Meer. An Muscheln. An Mangos. Und an die Kinder im Flugzeug, die bald hier sein würden.
Und während das Flugzeug leise weiterbrummte, schliefen alle ein: Lek im Wald und die Kinder hoch oben in den Wolken.` }
];
const QUIZ = [
  ['Wie heißt die Hauptstadt von Thailand?', ['Phuket', 'Bangkok', 'Koh Samet'], 1],
  ['Wie heißt das Geld in Thailand?', ['Euro', 'Baht', 'Dollar'], 1],
  ['Welches Tier ist das Nationaltier von Thailand?', ['Elefant', 'Löwe', 'Pinguin'], 0],
  ['Wie sagt man „Hallo“ auf Thai?', ['Sawasdee', 'Bonjour', 'Hola'], 0],
  ['Was bedeutet „Ko“ in Koh Samet?', ['Berg', 'Insel', 'Stadt'], 1],
  ['Was bedeutet „Hat“ in „Hat Sai Kaew“?', ['Strand', 'Hut', 'Hafen'], 0],
  ['Auf welcher Straßenseite fahren die Autos in Thailand?', ['rechts', 'links', 'in der Mitte'], 1],
  ['Wie viele Stunden ist Thailand im November weiter als Deutschland?', ['2', '6', '12'], 1],
  ['Wie heißt das Taxi mit drei Rädern?', ['Tuk-Tuk', 'Tick-Tack', 'Bim-Bam'], 0],
  ['Was liegt im Tempel Wat Pho?', ['Ein riesiger liegender Buddha', 'Ein Drache', 'Ein Schiff'], 0],
  ['Welche Frucht isst man mit Klebreis als Nachtisch?', ['Apfel', 'Mango', 'Banane'], 1],
  ['Wie lange fliegen wir ungefähr nach Bangkok?', ['3 Stunden', '11 Stunden', '24 Stunden'], 1],
  ['An welchem Meer liegt Koh Samet?', ['Nordsee', 'Golf von Thailand', 'Mittelmeer'], 1],
  ['Was heißt „Danke“ auf Thai?', ['Khop khun', 'Merci', 'Gracias'], 0]
];
const GAMES = [
  ['Ich packe meinen Koffer', 'Jeder sagt „Ich packe meinen Koffer und nehme mit …“, wiederholt alles davor und hängt etwas an. Wer etwas vergisst, fängt neu an.'],
  ['Ich sehe was, was du nicht siehst', 'Einer sucht sich etwas aus und nennt die Farbe. Die anderen raten.'],
  ['Wer bin ich?', 'Einer denkt sich ein Tier aus. Die anderen stellen Fragen, die man nur mit Ja oder Nein beantworten darf.'],
  ['Geschichten-Kette', 'Jeder sagt einen Satz, der nächste erzählt weiter. Start: „Auf einer Insel lebte eine Krabbe, die …“'],
  ['Zahlen raten', 'Einer denkt sich eine Zahl von 1 bis 100. Die anderen raten, die Antwort ist nur „höher“ oder „tiefer“.'],
  ['Reim-Ping-Pong', 'Einer sagt ein Wort, der nächste ein Reimwort: Strand – Sand – Hand – Land … Wem nichts einfällt, sagt das nächste Startwort.'],
  ['Stille Post', 'Einen Satz ins Ohr flüstern und weitergeben. Der Letzte sagt laut, was angekommen ist.']
];
function renderKids(main) {
  const n = now().getTime();
  const fl = trip.flights.find(f => n >= new Date(f.dep).getTime() - 3600000 && n <= new Date(f.arr).getTime());
  let flight = '';
  if (fl) {
    const dep = new Date(fl.dep).getTime(), arr = new Date(fl.arr).getTime();
    const pct = Math.max(0, Math.min(100, ((n - dep) / (arr - dep)) * 100));
    const left = Math.max(0, arr - n);
    flight = `<div class="card hero"><div class="small muted">FLUG ${esc(fl.number)} NACH ${esc(fl.to.split(' ')[0].toUpperCase())}</div>
      <div class="big">${n < dep ? 'Gleich geht’s los!' : `Noch ${Math.floor(left / 3600000)} h ${Math.floor((left % 3600000) / 60000)} min`}</div>
      <div class="planebar"><div style="width:${pct}%"></div><span style="left:calc(${pct}% - 14px)">✈️</span></div>
      <div class="small">${Math.round(pct)} % geschafft</div></div>`;
  }
  const q = store.get('quiz', {});
  main.innerHTML = `${flight}
    <div class="card hero"><div class="big">✈️ Pilotenspiel</div><p>Ihr seid die Piloten! Findet auf der Weltkarte das Land und die Stadt, wo ihr startet, dann das Ziel – und los geht’s.</p>
      <div class="small muted">${Object.keys(store.get('pilotStars', {})).length} von ${MISSIONS.length} Flügen geschafft</div>
      <div class="btns"><a class="btn block" href="#/pilot">Spielen</a></div></div>
    <h2>Geschichten</h2>
    ${STORIES.map((s, i) => `<details class="day"><summary><b>${esc(s.title)}</b></summary><div class="body">
      <div class="btns" style="margin-top:0"><button class="btn small" data-read="${i}">🔊 Vorlesen</button><button class="btn small ghost" data-stop>Stopp</button></div>
      ${s.text.split('\n').map(par => `<p>${esc(par)}</p>`).join('')}</div></details>`).join('')}
    <h2>Thailand-Quiz</h2>
    <div class="card">${QUIZ.map(([qq, opts, right], i) => `<div class="quiz" data-q="${i}"><b>${i + 1}. ${esc(qq)}</b>
      <div class="seg">${opts.map((o, j) => `<button type="button" data-ans="${i}|${j}" class="${q[i] != null ? (j === right ? 'right' : j === q[i] ? 'wrong' : '') : ''}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
      <div class="row between"><b id="quizScore">${Object.entries(q).filter(([i, v]) => QUIZ[i][2] === v).length} von ${QUIZ.length} richtig</b><button class="btn small ghost" id="quizReset">Neu</button></div></div>
    <h2>Memory</h2>
    <div class="card"><div class="memory" id="memory"></div><div class="row between small" style="margin-top:8px"><span id="memMoves"></span><button class="btn small ghost" id="memNew">Neu mischen</button></div></div>
    <h2>Spiele ohne alles</h2>
    <div class="card">${GAMES.map(([t2, d]) => `<p><b>${esc(t2)}</b><br><span class="small">${esc(d)}</span></p>`).join('')}</div>`;
  startMemory();
  main.addEventListener('click', e => {
    const r = e.target.closest('[data-read]');
    if (r) {
      if (!('speechSynthesis' in window)) return toast('Vorlesen geht in diesem Browser nicht');
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(STORIES[+r.dataset.read].text.replace(/\n/g, ' '));
      u.lang = 'de-DE'; u.rate = 0.9;
      speechSynthesis.speak(u);
    }
    if (e.target.closest('[data-stop]') && 'speechSynthesis' in window) speechSynthesis.cancel();
    const a2 = e.target.closest('[data-ans]');
    if (a2) {
      const [i, j] = a2.dataset.ans.split('|').map(Number);
      const s = store.get('quiz', {});
      if (s[i] != null) return;
      s[i] = j; store.set('quiz', s);
      $$(`[data-ans^="${i}|"]`, main).forEach((b, k) => b.classList.add(k === QUIZ[i][2] ? 'right' : k === j ? 'wrong' : 'x'));
      $('#quizScore').textContent = `${Object.entries(s).filter(([k, v]) => QUIZ[k][2] === v).length} von ${QUIZ.length} richtig`;
    }
    if (e.target.closest('#quizReset')) { store.del('quiz'); rerender(); }
    if (e.target.closest('#memNew')) startMemory();
  });
}
function startMemory() {
  const icons = ['🐘', '🥭', '🛺', '🐒', '🏝️', '🐠', '🦀', '🥥'];
  const cards = [...icons, ...icons].map(v => ({ v, r: Math.random() })).sort((x, y) => x.r - y.r).map(c => c.v);
  const box = $('#memory');
  let open = [], moves = 0, found = 0;
  box.innerHTML = cards.map((v, i) => `<button type="button" data-i="${i}" aria-label="Karte"><span>${v}</span></button>`).join('');
  $('#memMoves').textContent = 'Züge: 0';
  box.onclick = e => {
    const b = e.target.closest('button[data-i]');
    if (!b || b.classList.contains('up') || open.length === 2) return;
    b.classList.add('up'); open.push(b);
    if (open.length < 2) return;
    moves++; $('#memMoves').textContent = `Züge: ${moves}`;
    const [x, y] = open;
    if (cards[x.dataset.i] === cards[y.dataset.i]) {
      x.classList.add('done'); y.classList.add('done'); open = []; found++;
      if (found === icons.length) $('#memMoves').textContent = `Geschafft in ${moves} Zügen! 🎉`;
    } else setTimeout(() => { x.classList.remove('up'); y.classList.remove('up'); open = []; }, 900);
  };
}

/* ---------- Lernen: Karteikarten je Kind und Reisetag ---------- */
function learnData() { return store.get('learnLocal', null)?.data || trip.learn || { days: [] }; }
const splitPron = s => { const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s || ''); return m ? [m[1], m[2]] : [s || '', '']; };
const plainEn = s => String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
function speakEn(text) {
  if (!('speechSynthesis' in window) || !text) return toast('Vorlesen geht hier nicht');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 0.85;
  speechSynthesis.speak(u);
}
/* Welcher Text wird auf Englisch vorgelesen: die englische Seite der Karte */
function englishOf(c) {
  if (c.type === 'vocab') return plainEn(c.back);
  if (c.type === 'vocabEn' || c.type === 'understand') return plainEn(c.front);
  if (c.type === 'gap' || c.type === 'build') return plainEn(c.back);
  return '';
}
function cardFace(c, side) {
  const typeLabel = { vocab: 'Vokabel', vocabEn: 'Vokabel', gap: 'Lückentext', build: 'Satz bauen', understand: 'Verstehen', calc: 'Rechnen', qa: c.label || 'Frage' }[c.type];
  if (c.type === 'qa') {
    const txt = side === 'front' ? c.front : c.back;
    return { typeLabel, html: `<div class="${side === 'front' ? 'front' : 'back'} ${txt.length > 70 ? 'long' : ''}">${esc(txt)}</div>` };
  }
  if (side === 'front') {
    let main = c.front, hint = '';
    if (c.type === 'gap') { const m = /^(.*)\(([^)]*)\)\s*$/.exec(c.front); if (m) { main = m[1].trim(); hint = m[2]; } }
    else if (c.type === 'vocab' || c.type === 'vocabEn') { [main, hint] = c.type === 'vocabEn' ? splitPron(c.front) : [c.front, '']; }
    else if (c.type === 'build') { main = c.front.split('/').map(w => `<span class="word">${esc(w.trim())}</span>`).join(''); return { typeLabel, html: `<div class="words">${main}</div><div class="hint">Bau einen Satz!</div>` }; }
    else if (c.type === 'calc') return { typeLabel, html: `<div class="calc">${esc(c.front.replace(/·/g, ' · ').replace(/:/g, ' : '))} = ?</div>` };
    const shown = esc(main).replace(/_{2,}/g, '<span class="blank">?</span>');
    return { typeLabel, html: `<div class="front">${shown}</div>${hint ? `<div class="hint">${c.type === 'gap' ? 'Tipp: ' : 'sprich: '}${esc(hint)}</div>` : ''}` };
  }
  const [main, pron] = c.type === 'calc' ? [c.back, ''] : splitPron(c.back);
  return { typeLabel, html: `<div class="back">${esc(main)}</div>${pron ? `<div class="hint">${c.type === 'vocab' ? 'sprich: ' : ''}${esc(pron)}</div>` : ''}` };
}
function speakDe(text) {
  if (!('speechSynthesis' in window) || !text) return toast('Vorlesen geht hier nicht');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 0.9;
  speechSynthesis.speak(u);
}
const SUBJECT_ICON = { Englisch: '🇬🇧', Mathe: '🔢', Lesen: '📖', Länder: '🌍', Deutsch: '✏️' };
function renderLearn(main) {
  const data = learnData();
  if (!data.days.length) {
    main.innerHTML = `<div class="card">Noch keine Lerninhalte. <label class="btn small ghost">Datei laden (.md)<input type="file" id="learnFile" accept=".md,text/markdown,text/plain" hidden></label></div>`;
    bindLearnImport(main); return;
  }
  const units = data.days.flatMap(d => d.units);
  const kids = [...new Set(units.map(u => u.who))];
  const st = store.get('learnState', {});
  const kid = kids.includes(st.kid) ? st.kid : kids[0];
  const subjects = [...new Set(units.filter(u => u.who === kid).map(u => u.subject))];
  const subject = subjects.includes(st.subject) ? st.subject : subjects[0];
  const key = n => `${kid}|${subject}|${n}`;
  const done = store.get('learnDone', {});
  const t = today().date;
  const has = d => d.units.some(u => u.who === kid && u.subject === subject);
  const myDays = data.days.filter(has);
  const todayN = myDays.find(d => d.date === t)?.n;
  const dayN = st.day && myDays.some(d => d.n === st.day) ? st.day : (todayN || myDays.find(d => !done[key(d.n)])?.n || myDays[0].n);
  const day = data.days.find(d => d.n === dayN);
  const unit = day.units.find(u => u.who === kid && u.subject === subject);
  const doneCount = myDays.filter(d => done[key(d.n)]).length;
  const set = obj => { store.set('learnState', { kid, subject, ...obj }); rerender(); };
  main.innerHTML = `<div class="seg pad" style="margin-top:12px">${kids.map(k => `<button type="button" class="chip ${k === kid ? 'on' : ''}" data-kid="${esc(k)}">${esc(k)}</button>`).join('')}
      <a class="chip" href="#/atlas" style="text-decoration:none;display:inline-flex;align-items:center">🗺️ Länder-Atlas</a></div>
    <div class="seg pad" style="margin-top:0">${subjects.map(sj => `<button type="button" class="chip ${sj === subject ? 'on' : ''}" data-subject="${esc(sj)}">${SUBJECT_ICON[sj] || '📘'} ${esc(sj)}</button>`).join('')}</div>
    <div class="daychips pad">${myDays.map(d => `<button type="button" data-day="${d.n}" class="${d.n === dayN ? 'on' : ''}">${done[key(d.n)] ? '⭐' : ''}Tag ${d.n}<small>${esc(d.label)}</small></button>`).join('')}</div>
    <div class="headline"><div class="small muted">Tag ${day.n} · ${esc(day.label)} · ${esc(day.title)} · ${doneCount} von ${myDays.length} geschafft</div>
      <div class="big">${esc(unit.title || unit.subject)}</div></div>
    <div id="session"></div>
    <div class="card small"><div class="row between"><span>Neue Lerninhalte aus dem Chat (.md, gleiches Format) – werden ergänzt</span>
      <label class="btn small ghost">Datei laden<input type="file" id="learnFile" accept=".md,text/markdown,text/plain" hidden></label></div>
      ${store.get('learnLocal', null) ? `<div class="muted" style="margin-top:6px">Eigene Datei aktiv: ${esc(store.get('learnLocal').name)} · <button class="linkbtn" id="learnReset">Zurück zur Standardfassung</button></div>` : ''}</div>`;
  main.addEventListener('click', e => {
    const k = e.target.closest('[data-kid]'); if (k) return set({ kid: k.dataset.kid, subject: undefined });
    const sj = e.target.closest('[data-subject]'); if (sj) return set({ subject: sj.dataset.subject });
    const d = e.target.closest('[data-day]'); if (d) return set({ day: +d.dataset.day });
    if (e.target.closest('#learnReset')) { store.del('learnLocal'); toast('Standardfassung'); rerender(); }
  });
  bindLearnImport(main);
  runSession($('#session', main), unit, () => { const dn = store.get('learnDone', {}); dn[key(day.n)] = Date.now(); store.set('learnDone', dn); },
    myDays[myDays.indexOf(day) + 1], n => set({ day: n }));
}
function bindLearnImport(main) {
  $('#learnFile', main)?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const parsed = TripShared.parseLearnMd(await f.text(), trip.meta.start.slice(0, 4), trip.meta.kidAlias);
    const cards = parsed.days.reduce((s, d) => s + d.units.reduce((s2, u) => s2 + u.cards.length, 0), 0);
    if (!parsed.days.length || !cards) return toast('Datei hat nicht das erwartete Format');
    store.set('learnLocal', { name: f.name, t: Date.now(), data: TripShared.mergeLearn(learnData(), parsed, trip.meta.kidAlias) });
    toast(`${parsed.days.length} Tage, ${cards} Karten ergänzt`); rerender();
  });
}
function runSession(box, unit, onDone, nextDay, goDay) {
  let queue = unit.cards.map((c, i) => i), pos = 0, flipped = false, known = 0;
  let intro = unit.story.length ? 'story' : unit.knowledge ? 'knowledge' : '';
  const total = unit.cards.length;
  const [wpQ, wpA] = (unit.wordplay || '').split(' – ');
  const [mmQ, mmA] = (unit.mitmach || '').split(' – ');
  const extras = [
    unit.task && { title: '🧮 Sachaufgabe', text: unit.task, solution: unit.solution },
    unit.wordplay && { title: '🔤 Wortspiel', text: wpQ, solution: wpA },
    unit.question && { title: '🤔 Nachdenk-Frage', text: unit.question },
    unit.mitmach && { title: '🏖️ Mitmach-Aufgabe für unterwegs', text: mmQ, solution: mmA },
    unit.speak && { title: '🗣️ Sprech-Aufgabe für Mama & Papa', text: unit.speak }
  ].filter(Boolean);
  const draw = () => {
    if (intro === 'story') {
      box.innerHTML = `<div class="card reading">${unit.story.map(pp => `<p>${esc(pp)}</p>`).join('')}</div>
        <div class="btns pad"><button class="btn ghost" id="readAloud">🔊 Vorlesen</button><button class="btn ghost" id="stopRead">Stopp</button><button class="btn" id="toCards">Zu den Fragen →</button></div>`;
      $('#readAloud', box).onclick = () => speakDe(unit.story.join(' '));
      $('#stopRead', box).onclick = () => 'speechSynthesis' in window && speechSynthesis.cancel();
      $('#toCards', box).onclick = () => { 'speechSynthesis' in window && speechSynthesis.cancel(); intro = ''; draw(); };
      return;
    }
    if (intro === 'knowledge') {
      const lines = unit.knowledge.split('\n');
      const list = lines.filter(l => l.startsWith('- ')), text = lines.filter(l => !l.startsWith('- '));
      const countries = Object.values(COUNTRIES).filter(c => unit.knowledge.includes(c.name)).slice(0, 12);
      box.innerHTML = `<div class="card reading"><h3>💡 Wissen</h3>${text.map(pp => `<p>${esc(pp)}</p>`).join('')}
          ${list.length ? `<ul>${list.map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>` : ''}
          ${countries.length ? `<div class="btns">${countries.map(c => `<a class="btn small ghost" href="#/atlas/${c.id}">${c.flag} ${esc(c.name)}</a>`).join('')}</div><p class="small muted">Antippen: auf der Karte zeigen</p>` : ''}</div>
        <div class="btns pad"><button class="btn ghost" id="readAloud">🔊 Vorlesen</button><button class="btn" id="toCards">Zum Quiz →</button></div>`;
      $('#readAloud', box).onclick = () => speakDe(text.join(' ') + ' ' + list.map(l => l.slice(2)).join('. '));
      $('#toCards', box).onclick = () => { 'speechSynthesis' in window && speechSynthesis.cancel(); intro = ''; draw(); };
      return;
    }
    if (pos < queue.length) {
      const c = unit.cards[queue[pos]], face = cardFace(c, flipped ? 'back' : 'front'), en = englishOf(c);
      box.innerHTML = `<div class="learnbar pad"><div style="width:${Math.min(100, (known / total) * 100)}%"></div></div>
        <button class="flash ${flipped ? 'flipped' : ''}" id="flash" aria-live="polite">
          <span class="type">${face.typeLabel}${flipped ? ' · Lösung' : ''}</span>${face.html}
          ${flipped ? '' : '<span class="tap">Antippen für die Lösung</span>'}</button>
        <div class="btns pad">${en ? `<button class="btn ghost" id="say">🔊 Anhören</button>` : ''}
          ${flipped ? '<button class="btn" id="ok">😊 Gewusst</button><button class="btn ghost" id="again">🔁 Nochmal</button>' : '<button class="btn" id="show">Lösung zeigen</button>'}</div>
        <p class="pad small">${known} von ${total} gewusst${queue.length - pos > 1 ? ` · noch ${queue.length - pos - 1} Karte(n)` : ''}</p>`;
      $('#flash', box).onclick = () => { flipped = !flipped; draw(); };
      $('#show', box)?.addEventListener('click', () => { flipped = true; draw(); });
      $('#say', box)?.addEventListener('click', () => speakEn(en));
      $('#ok', box)?.addEventListener('click', () => { known++; pos++; flipped = false; draw(); });
      $('#again', box)?.addEventListener('click', () => { queue.push(queue[pos]); pos++; flipped = false; draw(); });
      return;
    }
    onDone();
    box.innerHTML = `<div class="next-hero"><div class="label">Geschafft!</div><div class="huge">⭐ Super!</div><div>Alle ${total} Karten geschafft.</div></div>
      ${extras.map(x => `<div class="card"><h3>${x.title}</h3><p style="margin:0">${esc(x.text)}</p>
        ${x.solution ? `<details style="margin-top:8px"><summary class="linkbtn">Lösung zeigen</summary><p style="margin:6px 0 0"><b>${esc(x.solution)}</b></p></details>` : ''}</div>`).join('')}
      <div class="btns pad"><button class="btn ghost" id="restart">Nochmal üben</button>${nextDay ? `<button class="btn" id="nextday">Weiter mit Tag ${nextDay.n}</button>` : ''}</div>`;
    $('#restart', box).onclick = () => { queue = unit.cards.map((c, i) => i); pos = 0; known = 0; flipped = false; intro = unit.story.length ? 'story' : unit.knowledge ? 'knowledge' : ''; draw(); };
    $('#nextday', box)?.addEventListener('click', () => goDay(nextDay.n));
  };
  draw();
}

/* ---------- Länder-Atlas: Steckbriefe und „Finde das Land“ auf der Weltkarte ---------- */
const COUNTRIES = {
  de: { id: 'de', iso: '276', name: 'Deutschland', flag: '🇩🇪', capital: 'Berlin', lat: 52.52, lon: 13.40, hello: 'Hallo',
    where: 'Mitten in Europa – rundherum liegen neun Nachbarländer.', facts: ['Der höchste Berg ist die Zugspitze in Bayern, fast 3.000 Meter hoch.', 'Die Gummibärchen wurden in Deutschland erfunden.'] },
  dk: { id: 'dk', iso: '208', name: 'Dänemark', flag: '🇩🇰', capital: 'Kopenhagen', lat: 55.68, lon: 12.57, hello: 'Hej (hai)',
    where: 'Ganz oben auf Deutschland – wie ein Daumen, der nach oben zeigt.', facts: ['Die LEGO-Steine kommen aus Dänemark.', 'In Kopenhagen sitzt die berühmte Statue der Kleinen Meerjungfrau.'] },
  pl: { id: 'pl', iso: '616', name: 'Polen', flag: '🇵🇱', capital: 'Warschau', lat: 52.23, lon: 21.01, hello: 'Cześć (tschäschtsch)',
    where: 'Rechts von Deutschland, also im Osten – ein großes Land, fast so breit wie hoch.', facts: ['Die Forscherin Marie Curie kam aus Polen und bekam zweimal den Nobelpreis.', 'Pierogi sind gefüllte Teigtaschen – ein Lieblingsessen in Polen.'] },
  cz: { id: 'cz', iso: '203', name: 'Tschechien', flag: '🇨🇿', capital: 'Prag', lat: 50.08, lon: 14.44, hello: 'Ahoj (ahoi)',
    where: 'Rechts unten von Deutschland, direkt neben Bayern.', facts: ['Der kleine Maulwurf aus dem Fernsehen kommt aus Tschechien.', 'Tschechien hat kein Meer.'] },
  at: { id: 'at', iso: '040', name: 'Österreich', flag: '🇦🇹', capital: 'Wien', lat: 48.21, lon: 16.37, hello: 'Servus oder Grüß Gott',
    where: 'Unter Bayern, also im Süden – lang und schmal, mit vielen Bergen.', facts: ['Der Komponist Mozart wurde in Salzburg geboren.', 'Ein großer Teil des Landes liegt in den Alpen.'] },
  ch: { id: 'ch', iso: '756', name: 'Schweiz', flag: '🇨🇭', capital: 'Bern', lat: 46.95, lon: 7.45, hello: 'Grüezi',
    where: 'Unter Baden-Württemberg, im Süden, mitten in den Alpen.', facts: ['Die Schweiz hat vier Landessprachen: Deutsch, Französisch, Italienisch und Rätoromanisch.', 'Ihre Flagge ist quadratisch.'] },
  fr: { id: 'fr', iso: '250', name: 'Frankreich', flag: '🇫🇷', capital: 'Paris', lat: 48.86, lon: 2.35, hello: 'Bonjour (bonschur)',
    where: 'Links von Deutschland, im Westen. Die Franzosen nennen ihr Land „das Sechseck“, weil es fast sechs Ecken hat.', facts: ['Der Eiffelturm in Paris ist über 300 Meter hoch.', 'Croissants kennt man aus Frankreich.'] },
  lu: { id: 'lu', iso: '442', name: 'Luxemburg', flag: '🇱🇺', capital: 'Luxemburg', lat: 49.61, lon: 6.13, hello: 'Moien',
    where: 'Winzig klein, zwischen Deutschland, Frankreich und Belgien – ganz genau hinschauen!', facts: ['Das Land und die Hauptstadt heißen gleich.', 'Es ist eines der kleinsten Länder Europas.'] },
  be: { id: 'be', iso: '056', name: 'Belgien', flag: '🇧🇪', capital: 'Brüssel', lat: 50.85, lon: 4.35, hello: 'Hallo oder Bonjour',
    where: 'Links von Deutschland, zwischen den Niederlanden und Frankreich.', facts: ['Die Schlümpfe wurden in Belgien erfunden.', 'Belgien ist berühmt für Waffeln, Pommes und Schokolade.'] },
  nl: { id: 'nl', iso: '528', name: 'Niederlande', flag: '🇳🇱', capital: 'Amsterdam', lat: 52.37, lon: 4.90, hello: 'Hallo',
    where: 'Links oben von Deutschland, an der Nordsee.', facts: ['Ein Teil des Landes liegt tiefer als das Meer – Deiche schützen es.', 'Dort gibt es viele Fahrräder, Windmühlen und Tulpen.'] },
  it: { id: 'it', iso: '380', name: 'Italien', flag: '🇮🇹', capital: 'Rom', lat: 41.90, lon: 12.50, hello: 'Ciao (tschau)',
    where: 'Unten im Mittelmeer – sieht aus wie ein Stiefel, der einen Ball kickt.', facts: ['Die Pizza kommt aus Italien.', 'In Rom steht das Kolosseum, ein riesiges altes Stadion.'] },
  es: { id: 'es', iso: '724', name: 'Spanien', flag: '🇪🇸', capital: 'Madrid', lat: 40.42, lon: -3.70, hello: 'Hola (ola)',
    where: 'Ganz links unten in Europa, zusammen mit Portugal fast ein Quadrat.', facts: ['Paella ist ein Reisgericht aus Spanien.', 'Flamenco ist ein spanischer Tanz mit Klatschen und Stampfen.'] },
  gr: { id: 'gr', iso: '300', name: 'Griechenland', flag: '🇬🇷', capital: 'Athen', lat: 37.98, lon: 23.73, hello: 'Jassas',
    where: 'Ganz rechts unten in Europa, mit ganz vielen Inseln im Meer.', facts: ['Die Olympischen Spiele kommen aus Griechenland.', 'Griechenland hat Tausende Inseln.'] },
  gb: { id: 'gb', iso: '826', name: 'Großbritannien', flag: '🇬🇧', capital: 'London', lat: 51.51, lon: -0.13, hello: 'Hello',
    where: 'Die große Insel links oben, auf der anderen Seite der Nordsee.', facts: ['Dort fahren die Autos links – genau wie in Thailand!', 'Big Ben ist die große Glocke im Uhrturm in London.'] },
  th: { id: 'th', iso: '764', name: 'Thailand', flag: '🇹🇭', capital: 'Bangkok', lat: 13.75, lon: 100.50, hello: 'Sawasdee (sawaddii)', region: 'asia',
    where: 'In Asien. Viele sagen: Thailand sieht aus wie ein Elefantenkopf, der Rüssel zeigt nach Süden.', facts: ['Der Elefant ist das Nationaltier von Thailand.', 'Hier fahren die Autos links.'] }
};
const VIEWS = { europe: { lon: [-12, 33], lat: [71, 34] }, asia: { lon: [90, 112], lat: [24, 4] } };
async function renderAtlas(main, arg) {
  if (!(await needMap(main))) return;
  const M = window.WORLD_MAP;
  const known = store.get('atlasSeen', {});
  let mode = 'explore', region = COUNTRIES[arg]?.region || 'europe', sel = COUNTRIES[arg] ? arg : null, quiz = null, miss = 0;
  const byIso = Object.fromEntries(Object.values(COUNTRIES).map(c => [c.iso, c]));
  const regionBox = r => { const V = VIEWS[r], [x1, y1] = geo(V.lon[0], V.lat[0]), [x2, y2] = geo(V.lon[1], V.lat[1]); return [x1, y1, x2, y2]; };
  main.innerHTML = `<div class="seg pad" style="margin-top:12px">
      <button type="button" class="chip" data-mode="explore">🔎 Entdecken</button><button type="button" class="chip" data-mode="quiz">🎯 Finde das Land</button>
      <button type="button" class="chip" data-region="europe">Europa</button><button type="button" class="chip" data-region="asia">Thailand</button></div>
    <div id="amap"></div><div id="atlasInfo"></div>`;
  const info = $('#atlasInfo', main);
  const view = mapView($('#amap', main), {
    start: { lon: 30 },
    overlay: u => sel ? (() => { const [x, y] = geo(COUNTRIES[sel].lon, COUNTRIES[sel].lat); return `<circle cx="${x}" cy="${y}" r="${5 * u}" class="capital" stroke-width="${2 * u}"></circle>`; })() : '',
    onTap: t => {
      const near = Object.values(COUNTRIES).find(k => { const [x, y] = geo(k.lon, k.lat); return Math.hypot(x - t.x, y - t.y) < 22 * t.u; });
      const c = byIso[t.id] || near;
      if (mode === 'explore') { if (!c) return; sel = c.id; known[c.id] = Date.now(); store.set('atlasSeen', known); paint(); return; }
      if (!quiz || quiz.i >= quiz.list.length) return;
      const want = quiz.list[quiz.i];
      if (c === want) { quiz.score += miss ? 0 : 1; quiz.i++; miss = 0; quiz.msg = `Richtig! ${want.name} – Hauptstadt ${want.capital}.`; sel = want.id; paint(); setTimeout(() => { sel = null; paint(); }, 1200); }
      else { miss++; quiz.msg = miss >= 2 ? `Schau, wo es blinkt! ${want.where}` : `Das ist ${t.id && M.countries.find(x => x.id === t.id)?.n || 'Meer'} – nochmal!`; paint(); }
    }
  });
  const paint = () => {
    $$('[data-mode]', main).forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $$('[data-region]', main).forEach(b => b.classList.toggle('on', b.dataset.region === region));
    $$('path.land', view.svg).forEach(p => { const c = byIso[p.dataset.id]; p.classList.toggle('learn', !!c); p.classList.toggle('sel', !!sel && c?.id === sel); p.classList.toggle('seen', mode === 'explore' && !!c && !!known[c.id]);
      p.classList.toggle('hint', mode === 'quiz' && miss >= 2 && quiz && c === quiz.list[quiz.i]); });
    view.redraw();
    if (mode === 'quiz') {
      if (!quiz) { const pool = Object.values(COUNTRIES).filter(c => (c.region || 'europe') === region); quiz = { list: pool.sort(() => Math.random() - .5).slice(0, Math.min(8, pool.length)), i: 0, score: 0, msg: '' }; }
      info.innerHTML = quiz.i >= quiz.list.length
        ? `<div class="next-hero"><div class="label">Fertig!</div><div class="huge">${quiz.score} von ${quiz.list.length}</div><div class="btns"><button class="btn" id="quizAgain">Nochmal</button></div></div>`
        : `<div class="card"><div class="small muted">Frage ${quiz.i + 1} von ${quiz.list.length} · ${quiz.score} richtig</div><div class="big">Wo ist ${quiz.list[quiz.i].flag} ${esc(quiz.list[quiz.i].name)}?</div><div class="small">${esc(quiz.msg) || 'Tipp auf die Karte.'}</div></div>`;
      return;
    }
    if (!sel) { info.innerHTML = `<div class="card"><b>Tipp auf ein Land!</b><div class="small muted">Die hellen Länder haben einen Steckbrief. ${Object.keys(known).length} von ${Object.keys(COUNTRIES).length} entdeckt.</div></div>`; return; }
    const c = COUNTRIES[sel], mission = MISSIONS.findIndex(m => CITIES[m.to].country === c.iso);
    info.innerHTML = `<div class="card"><div class="row"><span style="font-size:2.6rem;line-height:1">${c.flag}</span><div class="grow"><div class="big">${esc(c.name)}</div><div class="muted">Hauptstadt: <b>${esc(c.capital)}</b> (roter Punkt)</div></div></div>
      <p><b>📍 So findest du es:</b> ${esc(c.where)}</p>${c.facts.map(f => `<p style="margin:6px 0">⭐ ${esc(f)}</p>`).join('')}
      <p style="margin:6px 0">👋 Hallo heißt dort: <b>${esc(c.hello)}</b></p>
      <div class="btns"><button class="btn small ghost" id="sayFacts">🔊 Vorlesen</button>${mission >= 0 ? `<a class="btn small" href="#/pilot">✈️ Im Pilotenspiel hinfliegen</a>` : ''}</div></div>`;
    $('#sayFacts', info).onclick = () => speakDe(`${c.name}. Hauptstadt: ${c.capital}. ${c.where} ${c.facts.join(' ')}`);
  };
  main.addEventListener('click', e => {
    const md = e.target.closest('[data-mode]'); if (md) { mode = md.dataset.mode; sel = null; quiz = null; miss = 0; paint(); }
    const rg = e.target.closest('[data-region]'); if (rg) { region = rg.dataset.region; sel = null; quiz = null; miss = 0; view.animateTo(view.boxView(regionBox(region), 0.05)); paint(); }
    if (e.target.closest('#quizAgain')) { quiz = null; paint(); }
  });
  view.set(view.boxView(sel ? COUNTRIES[sel] && regionBox(region) : regionBox(region), 0.05));
  paint();
}

/* ---------- Zoombare Weltkarte (Pilotenspiel und Atlas) ---------- */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
}
async function needMap(main) {
  if (window.WORLD_MAP) return true;
  main.innerHTML = '<p class="pad"><span class="spinner"></span> Karte lädt …</p>';
  try { await loadScript('kids-map.js'); return main.isConnected; }
  catch { main.innerHTML = '<div class="card">Karte konnte nicht geladen werden. Einmal mit Internet öffnen.</div>'; return false; }
}
const geo = (lon, lat) => [(lon + 180) * window.WORLD_MAP.k, (window.WORLD_MAP.latTop - lat) * window.WORLD_MAP.k];
const CONTINENTS = [['NORDAMERIKA', -102, 58], ['SÜDAMERIKA', -86, -12], ['EUROPA', 4, 68], ['AFRIKA', 2, -14], ['ASIEN', 84, 63], ['OZEANIEN', 138, -40]];
const OCEANS = [['Atlantik', -40, 22], ['Pazifik', -150, 2], ['Indischer Ozean', 78, -22]];
const flagOf = a2 => a2 ? String.fromCodePoint(...[...a2.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : '';
/* Länderumrisse einmal in Punktlisten zerlegen – für „Welches Land liegt unter dem Flugzeug?“ */
let ringCache = null;
function countryAt(x, y) {
  ringCache ||= window.WORLD_MAP.countries.map(c => ({ c, rings: c.d.split('M').filter(Boolean).map(r => r.replace('Z', '').split('L').map(pt => pt.split(',').map(Number))) }));
  const inRing = ring => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  return ringCache.find(({ rings }) => rings.some(inRing))?.c || null;
}
function mapView(host, { start, onTap, overlay }) {
  const M = window.WORLD_MAP;
  host.innerHTML = `<div class="mapbox"><svg class="worldsvg" role="img" aria-label="Weltkarte">
      <rect x="-600" y="-300" width="2200" height="1000" class="sea"></rect>
      <g class="lands">${M.countries.map(c => `<path d="${c.d}" data-id="${c.id}" class="land"></path>`).join('')}</g>
      <g class="clabels"></g><g class="labels"></g><g class="overlay"></g></svg>
    <div class="mapctl"><button type="button" data-z="in" aria-label="Hineinzoomen">＋</button><button type="button" data-z="out" aria-label="Herauszoomen">−</button><button type="button" data-z="world" aria-label="Ganze Welt">🌍</button></div></div>`;
  const svg = $('svg', host), labels = $('.labels', host), clabels = $('.clabels', host), ov = $('.overlay', host);
  const px = () => svg.clientWidth || 360, ratio = () => (svg.clientHeight || 300) / px();
  // ganz herausgezoomt füllt die Karte die Höhe; im Hochformat wischt man dann seitlich weiter
  const maxW = () => Math.min(1100, (M.h + 60) / ratio());
  const home = (lon = start?.lon ?? 60) => { const w = maxW(); return { x: geo(lon, 0)[0] - w / 2, y: (M.h - w * ratio()) / 2, w }; };
  let vb = { home: true };
  const fit = v => { if (v.home) v = home(); const w = Math.max(18, Math.min(maxW(), v.w)), h = w * ratio(); return { x: Math.max(-80, Math.min(1080 - w, v.x)), y: Math.max(-40, Math.min(M.h + 40 - h, v.y)), w, h }; };
  const draw = () => {
    vb = fit(vb);
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const u = vb.w / px(), fs = 12.5 * u;
    // große Länder zuerst; ein Name wird nur gezeigt, wenn er niemanden überdeckt (Zoomen zeigt mehr)
    // Kontinente zuerst, dazu die Zoom-Knöpfe oben rechts als besetzte Fläche
    const placed = [[vb.x + vb.w - 64 * u, vb.y, vb.x + vb.w, vb.y + 170 * u]];
    const inView = ([x, y]) => x > vb.x && x < vb.x + vb.w && y > vb.y && y < vb.y + vb.h;
    const conts = vb.w > 200 ? CONTINENTS.map(([n, lo, la]) => [n, ...geo(lo, la)]).filter(([, x, y]) => inView([x, y])).filter(([n, x, y]) => {
      const hw = n.length * 6.5 * u, r = [x - hw, y - 11 * u, x + hw, y + 11 * u];
      if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false;
      placed.push(r); return true;
    }) : [];
    clabels.innerHTML = [...conts.map(([n, x, y]) => `<text class="cont" x="${x}" y="${y}" font-size="${14 * u}" stroke-width="${3 * u}">${n}</text>`),
      ...(vb.w > 200 ? OCEANS.map(([n, lo, la]) => geo(lo, la)).map(([x, y], i) => `<text class="ocean" x="${x}" y="${y}" font-size="${13 * u}">${OCEANS[i][0]}</text>`) : [])].join('');
    // Liegt der Namenspunkt außerhalb des Ausschnitts (z. B. Russland), steht der Name mitten im sichtbaren Teil des Landes
    const anchor = c => {
      if (inView([c.lx, c.ly])) return [c.lx, c.ly];
      const x1 = Math.max(c.bb[0], vb.x), x2 = Math.min(c.bb[2], vb.x + vb.w), y1 = Math.max(c.bb[1], vb.y), y2 = Math.min(c.bb[3], vb.y + vb.h);
      if ((x2 - x1) / u < 90 || (y2 - y1) / u < 30) return null;
      const p = [(x1 + x2) / 2, (y1 + y2) / 2];
      return countryAt(...p) === c ? p : null;
    };
    labels.innerHTML = M.countries.map(c => [c, anchor(c)]).filter(([, a]) => a)
      .sort(([p1], [p2]) => p2.ar - p1.ar).map(([c, [x, y]]) => {
        // kleine Länder bekommen eine kleinere Schrift, statt ganz ohne Namen zu bleiben
        const room = Math.max(c.bb[2] - c.bb[0], (c.bb[3] - c.bb[1]) * 1.6) / u, f = Math.max(0.78, Math.min(1, room / (c.n.length * 7.4 * 0.7)));
        const wpx = c.n.length * 7.4 * f;
        if (room < wpx * 0.45) return '';
        const r = [x - wpx / 2 * u, y - 8 * f * u, x + wpx / 2 * u, y + 8 * f * u];
        if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return '';
        placed.push(r);
        return `<text x="${x}" y="${y}" font-size="${fs * f}" stroke-width="${3 * u}">${esc(c.n)}</text>`;
      }).join('');
    ov.innerHTML = overlay ? overlay(u) : '';
  };
  const api = {
    get vb() { return vb; }, svg,
    set(v) { vb = { ...v }; draw(); }, home,
    animateTo(v, ms = 650) {
      const from = fit({ ...vb }), to = fit({ ...v }), t0 = performance.now();
      return new Promise(res => { const step = t => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        vb = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: 0 }; draw(); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    },
    boxView(bb, pad = 0.35) {
      const w0 = bb[2] - bb[0], h0 = bb[3] - bb[1], cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      const w = Math.max(w0 * (1 + pad), h0 * (1 + pad) / ratio(), 30);
      return { x: cx - w / 2, y: cy - w * ratio() / 2, w };
    },
    zoom(f, cx, cy) { cx ??= vb.x + vb.w / 2; cy ??= vb.y + vb.h / 2; const w = vb.w * f; vb = { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w }; draw(); },
    redraw: draw,
    toMap(clientX, clientY) { const r = svg.getBoundingClientRect(); return [vb.x + (clientX - r.left) / r.width * vb.w, vb.y + (clientY - r.top) / r.height * vb.h]; }
  };
  // Wischen = verschieben, zwei Finger = zoomen, Mausrad = zoomen, kurzer Tipp = Antwort
  const pts = new Map(); let g = null;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const p = [...pts.values()];
    g = p.length === 1 ? { kind: 'pan', x: e.clientX, y: e.clientY, vb: { ...vb }, moved: 0, t: Date.now(), target: e.target }
      : { kind: 'pinch', d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), vb: { ...vb }, c: api.toMap((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2), moved: 99 };
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const p = [...pts.values()];
    if (g.kind === 'pan' && p.length === 1) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y; g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      const u = g.vb.w / px(); vb = { ...g.vb, x: g.vb.x - dx * u, y: g.vb.y - dy * u }; draw();
    } else if (g.kind === 'pinch' && p.length >= 2) {
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), f = g.d / d, w = g.vb.w * f;
      vb = { x: g.c[0] - (g.c[0] - g.vb.x) * f, y: g.c[1] - (g.c[1] - g.vb.y) * f, w }; draw();
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (g?.kind === 'pan' && g.moved < 8 && Date.now() - g.t < 600) { const [x, y] = api.toMap(e.clientX, e.clientY); onTap?.({ x, y, id: g.target?.dataset?.id, u: vb.w / px() }); }
    if (!pts.size) g = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', e => { pts.delete(e.pointerId); g = null; });
  svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = api.toMap(e.clientX, e.clientY); api.zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
  host.querySelector('.mapctl').addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    if (b.dataset.z === 'world') api.animateTo(home((vb.x + vb.w / 2) / M.k - 180)); else api.zoom(b.dataset.z === 'in' ? 1 / 1.7 : 1.7);
  });
  addEventListener('resize', draw);
  requestAnimationFrame(draw);
  return api;
}

/* ---------- Pilotenspiel: Land und Stadt finden, dann in Etappen fliegen ---------- */
const CITIES = {
  fra: { name: 'Frankfurt', country: '276', land: 'Deutschland', lat: 50.11, lon: 8.68 },
  bkk: { name: 'Bangkok', country: '764', land: 'Thailand', lat: 13.75, lon: 100.50 },
  nyc: { name: 'New York', country: '840', land: 'USA', lat: 40.71, lon: -74.01 },
  cai: { name: 'Kairo', country: '818', land: 'Ägypten', lat: 30.04, lon: 31.24 },
  rey: { name: 'Reykjavík', country: '352', land: 'Island', lat: 64.15, lon: -21.94 },
  tyo: { name: 'Tokio', country: '392', land: 'Japan', lat: 35.68, lon: 139.69 },
  syd: { name: 'Sydney', country: '036', land: 'Australien', lat: -33.87, lon: 151.21 },
  rio: { name: 'Rio de Janeiro', country: '076', land: 'Brasilien', lat: -22.91, lon: -43.17 },
  cpt: { name: 'Kapstadt', country: '710', land: 'Südafrika', lat: -33.92, lon: 18.42 },
  nbo: { name: 'Nairobi', country: '404', land: 'Kenia', lat: -1.29, lon: 36.82 },
  pek: { name: 'Peking', country: '156', land: 'China', lat: 39.90, lon: 116.40 }
};
const MISSIONS = [
  { from: 'fra', to: 'bkk', fact: 'Hier landen wir! Thailand heißt auch „Land des Lächelns“. Es gibt goldene Tempel und Tuk-Tuks.' },
  { from: 'fra', to: 'nyc', fact: 'Im Hafen von New York steht die Freiheitsstatue und begrüßt die Schiffe.' },
  { from: 'fra', to: 'cai', fact: 'Ganz in der Nähe stehen die Pyramiden von Gizeh – über 4.000 Jahre alt.' },
  { from: 'fra', to: 'rey', fact: 'Island hat Vulkane, Gletscher und heiße Quellen, in denen man baden kann.' },
  { from: 'bkk', to: 'tyo', fact: 'Tokio ist eine der größten Städte der Welt. Der Shinkansen-Zug fährt über 300 km/h schnell.' },
  { from: 'bkk', to: 'syd', fact: 'Das Opernhaus von Sydney sieht aus wie Segel. Im November ist dort Frühling.' },
  { from: 'fra', to: 'rio', fact: 'Auf einem Berg über Rio steht eine riesige Christus-Statue mit ausgebreiteten Armen.' },
  { from: 'fra', to: 'cpt', fact: 'In Kapstadt leben Pinguine am Strand – mitten in Afrika!' },
  { from: 'fra', to: 'nbo', fact: 'Direkt neben Nairobi liegt ein Nationalpark mit Giraffen, Zebras und Löwen.' },
  { from: 'bkk', to: 'pek', fact: 'Nicht weit von Peking beginnt die Chinesische Mauer, das längste Bauwerk der Welt.' }
];
/* Was man aus dem Fenster „sieht“: ein, zwei Sätze zu Ländern auf den Routen */
const FLY_FACTS = {
  '203': 'Aus Tschechien kommt der kleine Maulwurf aus dem Fernsehen.',
  '616': 'In Polen leben Wisente – die schwersten Landtiere Europas.',
  '643': 'Russland ist das größte Land der Erde.',
  '398': 'Kasachstan ist das größte Land ohne Meer. Von hier starten Raketen ins Weltall.',
  '860': 'Usbekistan ist nur von Ländern ohne Meer umgeben.',
  '762': 'Mehr als die Hälfte von Tadschikistan liegt höher als 3.000 Meter.',
  '586': 'An der Grenze von Pakistan und China steht der K2, der zweithöchste Berg der Erde.',
  '356': 'In Indien leben Tiger und Elefanten. Es ist das Land mit den meisten Menschen der Welt.',
  '156': 'Wilde Pandas leben nur in China.',
  '524': 'In Nepal steht der Mount Everest, fast 9.000 Meter hoch. Nepals Flagge ist als einzige nicht rechteckig.',
  '050': 'In Bangladesch leben Tiger in riesigen Mangrovenwäldern am Meer.',
  '104': 'In Myanmar stehen Tausende alte Tempel, zum Beispiel in Bagan.',
  '056': 'Die Schlümpfe wurden in Belgien erfunden.',
  '528': 'In den Niederlanden gibt es viele Windmühlen, Tulpen und Fahrräder.',
  '826': 'In Großbritannien fahren die Autos links – genau wie in Thailand.',
  '372': 'Irland nennt man auch die „grüne Insel“.',
  '124': 'Kanada hat mehr Seen als jedes andere Land. Auf der Flagge ist ein Ahornblatt.',
  '040': 'In Österreich wurde der Komponist Mozart geboren.',
  '705': 'Mehr als die Hälfte von Slowenien ist mit Wald bedeckt.',
  '191': 'Die Dalmatiner-Hunde sind nach Dalmatien benannt, einer Gegend in Kroatien.',
  '499': 'Montenegro heißt übersetzt „schwarzer Berg“.',
  '300': 'Die Olympischen Spiele kommen aus Griechenland.',
  '818': 'Durch Ägypten fließt der Nil, einer der längsten Flüsse der Erde.',
  '418': 'Laos hat kein Meer, aber den großen Fluss Mekong.',
  '704': 'Vietnam ist lang und schmal wie ein S.',
  '458': 'In Malaysia stehen die Petronas-Türme, über 450 Meter hoch.',
  '360': 'Indonesien besteht aus über 17.000 Inseln. Hier lebt der Komodowaran, die größte Echse der Welt.',
  '250': 'Der Eiffelturm in Paris ist über 300 Meter hoch.',
  '724': 'Flamenco ist ein spanischer Tanz mit Klatschen und Stampfen.',
  '756': 'In der Schweiz spricht man vier Sprachen.',
  '380': 'Italien sieht aus wie ein Stiefel. Von hier kommt die Pizza.',
  '788': 'In der Wüste von Tunesien wurden Szenen von Star Wars gedreht.',
  '562': 'Der größte Teil von Niger ist Wüste – die Sahara.',
  '148': 'Der Tschadsee war früher riesig und ist heute viel kleiner.',
  '566': 'In Nigeria leben mehr Menschen als in jedem anderen Land Afrikas.',
  '120': 'Kamerun nennt man „Afrika im Kleinen“: Wüste, Berge, Regenwald und Strand.',
  '178': 'Hier fließt der Kongo, der tiefste Fluss der Erde.',
  '180': 'Hier fließt der Kongo, der tiefste Fluss der Erde.',
  '516': 'In der Namib-Wüste gibt es riesige rote Sanddünen.',
  '729': 'Im Sudan stehen mehr Pyramiden als in Ägypten.',
  '231': 'Aus Äthiopien kommt der Kaffee.'
};
const SKY_FACTS = ['Wir fliegen jetzt etwa 10 Kilometer hoch – höher als jeder Berg der Erde.', 'Draußen ist es eisig kalt, etwa minus 50 Grad.', 'Das Flugzeug fliegt rund 900 Kilometer pro Stunde schnell.'];
function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/* Großkreis: die kürzeste Strecke auf der Kugel, wie Flugzeuge sie fliegen */
function greatCircle(a, b, n) {
  const r = Math.PI / 180, [la1, lo1, la2, lo2] = [a.lat * r, a.lon * r, b.lat * r, b.lon * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2), y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2), z = A * Math.sin(la1) + B * Math.sin(la2);
    return geo(Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r);
  });
}
function flightStops(m, path) {
  const from = CITIES[m.from], to = CITIES[m.to];
  const seen = new Set([from.country, to.country]), lands = [];
  let seaRun = 0, seaAt = -1;
  path.forEach(([x, y], i) => {
    const c = countryAt(x, y);
    if (!c) { seaRun++; if (seaRun === 12 && seaAt < 0) seaAt = i - 6; return; }
    seaRun = 0;
    if (!seen.has(c.id) && FLY_FACTS[c.id]) { seen.add(c.id); lands.push({ i, title: `${flagOf(c.a2)} Unter uns: ${c.n}`, text: FLY_FACTS[c.id] }); }
  });
  const pick = lands.length > 4 ? [0, 1, 2, 3].map(k => lands[Math.round(k * (lands.length - 1) / 3)]) : lands;
  const stops = [...pick];
  if (seaAt > 0) stops.push({ i: seaAt, title: '🌊 Unter uns ist nur Meer', text: 'Mehr als zwei Drittel der Erde sind mit Wasser bedeckt.' });
  const sky = [...SKY_FACTS];
  for (const at of [0.12, 0.55, 0.85]) if (stops.length < 5) { const i = Math.round(at * (path.length - 1)); if (!stops.some(s => Math.abs(s.i - i) < 8)) stops.push({ i, title: '✈️ Im Flugzeug', text: sky.shift() }); }
  return stops.sort((s, t) => s.i - t.i);
}
async function renderPilot(main) {
  if (!(await needMap(main))) return;
  const M = window.WORLD_MAP;
  const byId = Object.fromEntries(M.countries.map(c => [c.id, c]));
  const stars = store.get('pilotStars', {});
  let mi = Math.max(0, MISSIONS.findIndex((m, i) => !stars[i])), step = 0, misses = 0, busy = false, fly = null;
  main.innerHTML = `<div class="missions pad" id="missions">${MISSIONS.map((m, i) => `<button type="button" data-m="${i}">${stars[i] ? '⭐' : '✈️'} ${esc(CITIES[m.to].name)}</button>`).join('')}</div>
    <div class="taskcard"><div class="small muted" id="pStep"></div><div class="big" id="pTask"></div><div id="pMsg" class="small">&nbsp;</div></div>
    <div id="pmap"></div>
    <p class="pad small">Mit zwei Fingern zoomen, mit einem Finger verschieben – oder ＋ und − benutzen.</p>`;
  const steps = m => [
    { kind: 'land', city: CITIES[m.from], text: `Wo ist ${CITIES[m.from].land}?`, label: 'Schritt 1 von 4 · Start-Land' },
    { kind: 'city', city: CITIES[m.from], text: `Tippe auf ${CITIES[m.from].name}!`, label: 'Schritt 2 von 4 · Start-Stadt' },
    { kind: 'land', city: CITIES[m.to], text: `Wo ist ${CITIES[m.to].land}?`, label: 'Schritt 3 von 4 · Ziel-Land' },
    { kind: 'city', city: CITIES[m.to], text: `Tippe auf ${CITIES[m.to].name}!`, label: 'Schritt 4 von 4 · Ziel-Stadt' }
  ];
  const overlay = u => {
    const m = MISSIONS[mi], st = steps(m)[step];
    let h = '';
    if (fly) {
      h += `<polyline points="${fly.path.map(p => p.join(',')).join(' ')}" class="route-ahead" stroke-width="${2.5 * u}" stroke-dasharray="${6 * u} ${5 * u}"></polyline>`;
      h += `<polyline points="${fly.path.slice(0, fly.pos + 1).map(p => p.join(',')).join(' ')}" class="route-done" stroke-width="${3.5 * u}"></polyline>`;
      const [x, y] = fly.path[fly.pos];
      h += `<text x="${x}" y="${y}" font-size="${30 * u}" text-anchor="middle" dominant-baseline="middle">✈️</text>`;
      return h;
    }
    if (st?.kind === 'city' || step > 1) Object.values(CITIES).forEach(c => { const [x, y] = geo(c.lon, c.lat), done = (step > 1 && c === CITIES[m.from]);
      if (st?.kind === 'city' || done) h += `<circle cx="${x}" cy="${y}" r="${(done ? 7 : 6) * u}" class="${done ? 'cityok' : 'city'} ${st?.kind === 'city' && misses >= 2 && c === st.city ? 'cityhint' : ''}" stroke-width="${2 * u}"></circle>
        ${st?.kind === 'city' ? `<text x="${x + 9 * u}" y="${y + 4 * u}" font-size="${12 * u}" class="citylabel" stroke-width="${3 * u}">${esc(c.name)}</text>` : ''}`; });
    return h;
  };
  const view = mapView($('#pmap', main), { start: { lon: 40 }, overlay, onTap: t => tap(t) });
  const paint = () => {
    const m = MISSIONS[mi], st = steps(m)[step];
    $$('#missions button', main).forEach((b, i) => b.classList.toggle('on', i === mi));
    $$('path.land', view.svg).forEach(p => p.classList.remove('hint', 'ok'));
    if (step > 0) $(`path[data-id="${CITIES[m.from].country}"]`, view.svg)?.classList.add('ok');
    if (step > 2) $(`path[data-id="${CITIES[m.to].country}"]`, view.svg)?.classList.add('ok');
    if (st && st.kind === 'land' && misses >= 2) $(`path[data-id="${st.city.country}"]`, view.svg)?.classList.add('hint');
    if (st) { $('#pStep').textContent = `Mission ${mi + 1}: ${CITIES[m.from].name} → ${CITIES[m.to].name} · ${st.label}`; $('#pTask').textContent = st.text; }
    view.redraw();
  };
  const midLon = () => { const m = MISSIONS[mi]; return (CITIES[m.from].lon + CITIES[m.to].lon) / 2; };
  const startMission = i => { mi = i; step = 0; misses = 0; busy = false; fly = null; $('#pMsg').innerHTML = '&nbsp;'; paint(); view.animateTo(view.home(midLon())); };
  function tap(t) {
    if (busy) return;
    const m = MISSIONS[mi], st = steps(m)[step];
    const [tx, ty] = geo(st.city.lon, st.city.lat);
    const near = Math.hypot(t.x - tx, t.y - ty) < 26 * t.u;
    const hit = st.kind === 'land' ? (t.id === st.city.country || near) : near;
    if (!hit) {
      misses++;
      const other = st.kind === 'land' && t.id && byId[t.id] ? `Das ist ${byId[t.id].n}. ` : '';
      $('#pMsg').textContent = misses >= 2 ? `${other}Ich helfe dir – schau, wo es blinkt!` : `${other}Versuch’s nochmal!`;
      if (misses >= 2) view.animateTo(view.boxView(byId[st.city.country].bb, 1.8));
      paint(); return;
    }
    misses = 0; step++;
    $('#pMsg').textContent = ['Super!', 'Genau!', 'Richtig!', 'Klasse!'][step % 4];
    if (step === 1 || step === 3) { paint(); view.animateTo(view.boxView(byId[st.city.country].bb, 0.6)); return; }
    if (step === 2) { paint(); view.animateTo(view.home(midLon())); return; }
    startFlight();
  }
  async function startFlight() {
    busy = true;
    const m = MISSIONS[mi], a = CITIES[m.from], b = CITIES[m.to];
    const path = greatCircle(a, b, 160), stops = flightStops(m, path);
    fly = { path, pos: 0 };
    const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
    await view.animateTo(view.boxView([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 0.25));
    const km = Math.round(kmBetween(a, b) / 100) * 100, hours = Math.round(km / 850);
    $('#pStep').textContent = `Mission ${mi + 1} · ${a.name} → ${b.name}`;
    $('#pTask').textContent = 'Abflug! 🛫';
    $('#pMsg').textContent = `Strecke ca. ${km.toLocaleString('de-DE')} km · Flugzeit ca. ${hours} Stunden`;
    const flyTo = target => new Promise(res => { const t0 = performance.now(), p0 = fly.pos, ms = Math.max(600, (target - p0) * 28);
      const f = now2 => { const k = Math.min(1, (now2 - t0) / ms); fly.pos = Math.round(p0 + (target - p0) * k); view.redraw(); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    for (const s of stops) {
      await flyTo(s.i);
      if (!main.isConnected || !fly) return;
      $('#pTask').textContent = s.title;
      $('#pMsg').innerHTML = `${esc(s.text)}<div class="btns"><button class="btn small" id="goOn">Weiterfliegen ✈️</button><button class="btn small ghost" id="skip">Direkt landen</button></div>`;
      const choice = await new Promise(res => { $('#goOn').onclick = () => res('go'); $('#skip').onclick = () => res('skip'); });
      if (choice === 'skip') break;
    }
    await flyTo(path.length - 1);
    if (!main.isConnected) return;
    const st2 = store.get('pilotStars', {}); st2[mi] = true; store.set('pilotStars', st2);
    $$('#missions button', main)[mi].textContent = `⭐ ${b.name}`;
    const info = Object.values(COUNTRIES).find(c => c.iso === b.country);
    $('#pStep').textContent = `Gelandet! ⭐ ${km.toLocaleString('de-DE')} km geflogen`;
    $('#pTask').textContent = `${flagOf(byId[b.country]?.a2)} ${b.name}`;
    $('#pMsg').innerHTML = `${esc(m.fact)}<div class="btns">${info ? `<a class="btn small ghost" href="#/atlas/${info.id}">Steckbrief</a>` : ''}${mi + 1 < MISSIONS.length ? '<button class="btn small" id="nextM">Nächste Mission</button>' : '<b>Alle Flüge geschafft – ihr seid echte Piloten! 🎉</b>'}</div>`;
    $('#nextM')?.addEventListener('click', () => startMission(mi + 1));
  }
  $('#missions', main).addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) startMission(+b.dataset.m); });
  paint();
}

/* ---------- Anmeldung & Start ---------- */
async function fetchBox(role, force) {
  const r = await fetch(FILES[role], { cache: force ? 'reload' : 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function login(pass) {
  let reached = false;
  for (const role of ['familie', 'gast']) {
    let box;
    try { box = await fetchBox(role); reached = true; } catch { continue; }
    try {
      trip = { ...(await TripShared.decryptJson(box, pass)), role };
      store.set('session', { pass, role });
      store.set('tripCache', trip);
      return 'ok';
    } catch {}
  }
  return reached ? 'wrong' : 'offline';
}
async function loadTrip(force = false) {
  const s = store.get('session', null);
  if (!s) { trip = null; return; }
  trip = trip || store.get('tripCache', null);
  let box;
  try { box = await fetchBox(s.role, force); } catch { return; } // offline: letzte Fassung behalten
  try { trip = { ...(await TripShared.decryptJson(box, s.pass)), role: s.role }; store.set('tripCache', trip); }
  catch { trip = null; store.del('session'); store.del('tripCache'); } // Passwort wurde geändert
}
function logout() {
  store.del('session'); store.del('tripCache');
  trip = null;
  location.hash = '';
  route();
}
function renderLogin() {
  $('#pageTitle').textContent = 'Thailand 2026';
  $('#sosBtn').hidden = true;
  $('#backBtn').hidden = true;
  $('.tabbar').hidden = true;
  const old = $('#app');
  const main = old.cloneNode(false);
  if (old.parentNode) old.parentNode.replaceChild(main, old);
  main.innerHTML = `<div class="card hero" style="margin-top:24px">
    <div class="big">Bangkok & Koh Samet</div>
    <p>30.10.–8.11.2026. Bitte das Passwort eingeben, das ihr bekommen habt – drei Wörter.</p>
    <form id="loginForm" autocomplete="off">
      <label class="field"><span>Passwort</span><input id="pass" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
      <button class="btn block" type="submit" id="loginBtn">Öffnen</button>
      <p class="small" id="loginMsg" role="status"></p>
    </form></div>`;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true;
    $('#loginMsg').innerHTML = '<span class="spinner"></span> Prüfe …';
    const res = await login($('#pass').value);
    btn.disabled = false;
    if (res === 'ok') { location.hash = '#/heute'; route(); if (await loadWeather()) rerender(); return; }
    $('#loginMsg').textContent = res === 'offline'
      ? 'Keine Verbindung. Beim ersten Öffnen braucht es Internet.'
      : 'Passwort passt nicht. Drei Wörter mit Leerzeichen, Groß- und Kleinschreibung egal.';
  });
}
function netState() { $('#netState').textContent = navigator.onLine ? '' : '● offline'; }

async function applyBg() {
  try {
    const bg = (await docsDb.all()).find(d => d.id === 'bg');
    document.documentElement.style.setProperty('--bgimg', bg ? `url("${URL.createObjectURL(bg.blob)}")` : 'url("bg.svg")');
  } catch {}
}
(async function init() {
  netState();
  applyBg();
  addEventListener('online', () => { netState(); if (trip) loadWeather().then(c => c && rerender()); });
  addEventListener('offline', netState);
  addEventListener('hashchange', route);
  // interne Links selbst auflösen (falls die Seite eingebettet läuft und der Hash nicht ankommt)
  document.addEventListener('click', e => {
    const a2 = e.target.closest('a[href^="#/"]');
    if (!a2) return;
    e.preventDefault();
    if (location.hash !== a2.getAttribute('href')) history.pushState(null, '', a2.getAttribute('href'));
    route();
  });
  addEventListener('popstate', route);
  $('#backBtn').addEventListener('click', () => { history.pushState(null, '', '#/mehr'); route(); });
  await loadTrip();
  route();
  if (trip && await loadWeather()) rerender();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
