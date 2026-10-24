// Baut kids-map.js (Weltkarte für Pilotenspiel und Atlas) aus world-atlas/countries-110m.json (Natural Earth, gemeinfrei)
// und deutschen Ländernamen aus i18n-iso-countries (MIT).
// Aufruf: node tools/build-map.js countries-110m.json topojson-client.js i18n-iso-countries/
const fs = require('fs');
const path = require('path');
const [src, topoLib, isoDir] = process.argv.slice(2);
const topojson = require(path.resolve(topoLib));
const topo = JSON.parse(fs.readFileSync(src, 'utf8'));
const de = require(path.resolve(isoDir, 'langs/de.json')).countries;
const codes = require(path.resolve(isoDir, 'codes.json'));
const a2ByNum = Object.fromEntries(codes.map(c => [c[2], c[0]]));
// kindgerechte Kurzformen
const SHORT = { '840': 'USA', '826': 'Großbritannien', '643': 'Russland', '408': 'Nordkorea', '410': 'Südkorea', '180': 'Kongo (Dem. Rep.)', '178': 'Kongo',
  '784': 'Arab. Emirate', '807': 'Nordmazedonien', '070': 'Bosnien-Herzeg.', '140': 'Zentralafrika', '214': 'Dominik. Rep.', '626': 'Osttimor', '384': 'Elfenbeinküste', '732': 'Westsahara' };
const BY_NAME = { 'N. Cyprus': 'Nordzypern', 'Somaliland': 'Somaliland', 'Kosovo': 'Kosovo' };
const W = 1000, LAT_TOP = 78, LAT_BOTTOM = -57, K = W / 360;
const H = Math.round((LAT_TOP - LAT_BOTTOM) * K);
const r1 = v => Math.round(v * 10) / 10;
const px = ([lon, lat]) => [r1((lon + 180) * K), r1((LAT_TOP - Math.max(LAT_BOTTOM, Math.min(LAT_TOP, lat))) * K)];
// Ringe über die Datumsgrenze (Russland, Fidschi) nach rechts verschieben, sonst laufen Striche quer über die Karte
const unwrap = r => r.some((p, i) => i && Math.abs(p[0] - r[i - 1][0]) > 180) ? r.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : r;
const ringArea = pts => { let a = 0, cx = 0, cy = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f; } a /= 2; return { a: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) }; };
const countries = topojson.feature(topo, topo.objects.countries).features
  .filter(f => f.properties.name !== 'Antarctica' && f.geometry)
  .map(f => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = polys.map(p => p.map(r => unwrap(r).map(px)));
    let best = null;
    for (const p of rings) { const g = ringArea(p[0]); if (!best || g.a > best.a) best = { ...g, ring: p[0] }; }
    const xs = best.ring.map(p => p[0]), ys = best.ring.map(p => p[1]);
    let n = SHORT[f.id] || de[a2ByNum[f.id]] || BY_NAME[f.properties.name] || f.properties.name;
    if (Array.isArray(n)) n = n.slice().sort((x, y) => x.length - y.length).find(x => x.length > 3) || n[0];
    return { id: f.id, n, a2: a2ByNum[f.id] || '', lx: r1(best.cx), ly: r1(best.cy), ar: Math.round(best.a), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(r1),
      d: rings.map(p => p.map(r => 'M' + r.map(q => q.join(',')).join('L') + 'Z').join('')).join('') };
  });
const out = `/* Weltkarte für Pilotenspiel und Atlas. Daten: Natural Earth (gemeinfrei) über world-atlas (ISC), Ländernamen: i18n-iso-countries (MIT). Erzeugt mit tools/build-map.js */
window.WORLD_MAP = ${JSON.stringify({ w: W, h: H, latTop: LAT_TOP, k: K, countries })};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'kids-map.js'), out);
console.log('kids-map.js', out.length, 'Zeichen,', countries.length, 'Länder');
