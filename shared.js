/* Gemeinsam für App und Werkzeug (tools/encrypt.js):
   Verschlüsselung der Reisedaten und die abgespeckte Fassung für Gäste. */
(function (root) {
  'use strict';
  const ITER = 400000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // Groß-/Kleinschreibung und Trennzeichen egal: „Mango Fähre Gecko“ = „mango-fähre-gecko“
  function normalizePass(p) { return String(p || '').toLowerCase().trim().replace(/[\s\-_.,;/+]+/g, ' '); }

  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(normalizePass(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptJson(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt, ITER);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    return { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
  }

  // wirft bei falschem Passwort
  async function decryptJson(box, pass) {
    const key = await deriveKey(pass, unb64(box.salt), box.iter);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
    return JSON.parse(dec.decode(plain));
  }

  // Gäste sehen Plan, Orte, Wetter und Flugzeiten – keine Unterkünfte, Adressen, Gastgeber, Kosten, Listen
  function guestData(trip) {
    const privateMaps = new Set(trip.stays.flatMap(s => [s.maps, s.address]).filter(m => m && !/^(koh samet|bangkok)$/i.test(m)));
    const hosts = trip.stays.map(s => (s.host || '').replace(/^Gastgeber(in)?\s*/i, '').trim()).filter(Boolean);
    const names = trip.stays.map(s => s.name).filter(n => n && !/unterkunft|nicht gebucht/i.test(n));
    const scrub = t => hosts.reduce((s, h) => s.split(h).join(''), names.reduce((s, n) => s.split(n).join('Unterkunft'), String(t || '')))
      .replace(/\s*\(bei\s*\)/g, '').replace(/Airbnb/g, 'Unterkunft').replace(/\s{2,}/g, ' ').trim();
    const ideaWiki = Object.fromEntries(Object.values(trip.ideas || {}).flat().filter(i => i.wiki).map(i => [i.maps, i.wiki]));
    const cleanItem = it => {
      const priv = privateMaps.has(it.maps);
      const note = /Meine Codes|Buchung|Code/i.test(it.note || '') ? '' : scrub(it.note);
      return { time: it.time, title: scrub(it.title), place: priv ? 'Unterkunft' : scrub(it.place), maps: priv ? '' : it.maps, wiki: priv ? '' : it.wiki || ideaWiki[it.maps] || '', note, check: it.check, open: it.open };
    };
    const cleanPlan = p => ({ type: p.type, title: scrub(p.title), items: p.items.map(cleanItem) });
    return {
      role: 'gast',
      meta: { title: trip.meta.title, subtitle: trip.meta.subtitle, start: trip.meta.start, end: trip.meta.end, travelers: trip.meta.travelers, stand: trip.meta.stand },
      places: trip.places,
      flights: trip.flights.map(f => ({ id: f.id, number: f.number, airline: f.airline, class: f.class, from: f.from, to: f.to, dep: f.dep, arr: f.arr, depDisplay: f.depDisplay, arrDisplay: f.arrDisplay })),
      days: trip.days.map(d => ({ date: d.date, place: d.place, title: scrub(d.title), planA: cleanPlan(d.planA), planB: (d.planB || []).map(cleanPlan) }))
    };
  }

  // Fotos: ein zufälliger Schlüssel pro Tagebuch, Format = 12 Byte IV + verschlüsselte Bilddaten
  async function newKey() {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    return b64(new Uint8Array(await crypto.subtle.exportKey('raw', k)));
  }
  function importKey(keyB64) { return crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return out;
  }
  async function decryptBytes(key, bytes) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
  }

  // Lerninhalte aus Markdown. Erkannt werden:
  // „## Tag N – Wt T.M. – Titel“, „### Kind – Fach, Titel“ bzw. „### Kind – Titel“,
  // Tabellen (Typ | Vorne | Hinten oder Aufgabe | Lösung), Geschichtentext (Absätze), **Wissen:**,
  // **Fragen** / **Quiz** mit „1. Frage – Antwort“, **Frage:**, **Sprech-Aufgabe:**, **Sachaufgabe:**,
  // **Lösung:**, **Wortspiel:**, **Mitmach-Aufgabe:** (Antwort jeweils nach „ – “)
  const CARD_TYPES = { 'vokabel': 'vocab', 'vokabel (vorne englisch)': 'vocabEn', 'lücke': 'gap', 'satz bauen': 'build', 'verstehen': 'understand' };
  const KNOWN_SUBJECTS = ['Englisch', 'Mathe', 'Deutsch', 'Lesen', 'Länder', 'Erdkunde', 'Sachkunde'];
  const splitQA = t => { const k = t.indexOf(' – '); return k < 0 ? [t.trim(), ''] : [t.slice(0, k).trim(), t.slice(k + 3).trim()]; };
  // alias (z. B. { Tochter: Name }) kommt aus den verschlüsselten Reisedaten: meta.kidAlias
  function parseLearnMd(md, year, alias = {}) {
    const KID_ALIAS = alias;
    const days = [];
    let day = null, unit = null, cols = null, block = '';
    for (const raw of md.split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if ((m = /^##\s+Tag\s+(\d+)\s*[–-]\s*(.+?)\s*[–-]\s*(.+)$/.exec(line))) {
        const d = /(\d{1,2})\.(\d{1,2})\./.exec(m[2]);
        day = { n: +m[1], date: d ? `${year}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : '', label: m[2], title: m[3], units: [] };
        days.push(day); unit = null; continue;
      }
      if (day && (m = /^###\s+(.+?)\s*[–-]\s*(.+)$/.exec(line))) {
        const who = KID_ALIAS[m[1].trim()] || m[1].trim();
        let subject = '', title = m[2].trim();
        const sm = /^([^,]+),\s*(.+)$/.exec(title);
        if (sm && KNOWN_SUBJECTS.includes(sm[1].trim())) { subject = sm[1].trim(); title = sm[2].trim(); }
        unit = { who, subject, title, cards: [], story: [], knowledge: '', question: '', speak: '', task: '', solution: '', wordplay: '', mitmach: '' };
        day.units.push(unit); cols = null; block = ''; continue;
      }
      if (!unit || !line || line === '---') { cols = line ? cols : null; continue; }
      if (line.startsWith('|')) {
        const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map(c => c.trim());
        if (cells.every(c => /^:?-+:?$/.test(c))) continue;
        if (!cols) { cols = cells.map(c => c.toLowerCase()); continue; }
        if (cols[0] === 'typ') unit.cards.push({ type: CARD_TYPES[cells[0].toLowerCase()] || 'vocab', label: cells[0], front: cells[1], back: cells[2] });
        else unit.cards.push({ type: 'calc', label: 'Rechnen', front: cells[0], back: cells[1] });
        continue;
      }
      if ((m = /^\*\*(Fragen|Quiz)\*\*/.exec(line))) { block = 'qa'; continue; }
      if ((m = /^\*\*(Frage|Sprech-Aufgabe|Sachaufgabe|Lösung|Wortspiel|Mitmach-Aufgabe|Wissen):\*\*\s*(.+)$/.exec(line))) {
        const key = { 'Frage': 'question', 'Sprech-Aufgabe': 'speak', 'Sachaufgabe': 'task', 'Lösung': 'solution', 'Wortspiel': 'wordplay', 'Mitmach-Aufgabe': 'mitmach', 'Wissen': 'knowledge' }[m[1]];
        unit[key] = m[2]; block = key === 'knowledge' ? 'knowledge' : ''; continue;
      }
      if (block === 'qa' && (m = /^\d+\.\s+(.+)$/.exec(line))) {
        const [q, a] = splitQA(m[1]);
        unit.cards.push({ type: 'qa', label: /^Nachdenken:/.test(q) ? 'Nachdenken' : 'Frage', front: q.replace(/^Nachdenken:\s*/, ''), back: a });
        continue;
      }
      if (block === 'knowledge') { unit.knowledge += '\n' + line; continue; }
      if (!block && !unit.cards.length && !unit.knowledge) unit.story.push(line);
    }
    for (const d of days) for (const u of d.units) {
      if (!u.subject) u.subject = u.story.length ? 'Lesen' : u.knowledge ? 'Länder' : 'Lernen';
      u.title = u.title.replace(/^Paul und der Gecko,\s*/, '');
    }
    return { days };
  }
  // neue Inhalte übernehmen: gleiche Kombination Kind + Fach + Tag wird ersetzt, alles andere bleibt
  function mergeLearn(base, add, KID_ALIAS = {}) {
    const out = { days: (base?.days || []).map(d => ({ ...d, units: [...d.units] })) };
    for (const d of add.days) {
      let t = out.days.find(x => x.n === d.n);
      if (!t) { t = { ...d, units: [] }; out.days.push(t); }
      for (const u of d.units) {
        t.units = t.units.filter(x => !((KID_ALIAS[x.who] || x.who) === u.who && x.subject === u.subject));
        t.units.push(u);
      }
    }
    for (const d of out.days) for (const u of d.units) u.who = KID_ALIAS[u.who] || u.who;
    out.days.sort((a, b) => a.n - b.n);
    return out;
  }

  root.TripShared = { encryptJson, decryptJson, guestData, normalizePass, newKey, importKey, encryptBytes, decryptBytes, b64, unb64, parseLearnMd, mergeLearn };
})(typeof window !== 'undefined' ? window : globalThis);
