// Übernimmt Lerninhalte (Markdown) in die private trip.json; danach tools/encrypt.js laufen lassen.
// Aufruf: node tools/import-learn.js pfad/zu/trip.json pfad/zu/lerninhalte.md
const fs = require('fs');
require('../shared.js');
const [tripFile, mdFile] = process.argv.slice(2);
const trip = JSON.parse(fs.readFileSync(tripFile, 'utf8'));
const { parseLearnMd, mergeLearn } = globalThis.TripShared;
trip.learn = mergeLearn(trip.learn, parseLearnMd(fs.readFileSync(mdFile, 'utf8'), trip.meta.start.slice(0, 4), trip.meta.kidAlias), trip.meta.kidAlias);
fs.writeFileSync(tripFile, JSON.stringify(trip, null, 2));
const units = trip.learn.days.flatMap(d => d.units);
console.log(`${trip.learn.days.length} Tage, ${units.length} Päckchen, ${units.reduce((s, u) => s + u.cards.length, 0)} Karten`);
for (const u of units) if (!u.cards.length) console.log('Auffällig:', u.who, u.title);
