// Verschlüsselt eine Klartext-trip.json in data/familie.enc.json und data/gaeste.enc.json.
// Aufruf: node tools/encrypt.js pfad/zu/trip.json "drei wörter familie"
// Das Gäste-Passwort steht in trip.json unter meta.viewerPass.
// Normalerweise nicht nötig: in der App unter Mehr → Reisedaten bearbeiten geht dasselbe.
const fs = require('fs');
const path = require('path');
require('../shared.js');

(async () => {
  const [file, familyPass] = process.argv.slice(2);
  if (!file || !familyPass) { console.error('Aufruf: node tools/encrypt.js trip.json "familien passwort"'); process.exit(1); }
  const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!trip.meta.viewerPass) { console.error('meta.viewerPass fehlt in trip.json'); process.exit(1); }
  const out = path.join(__dirname, '..', 'data');
  fs.mkdirSync(out, { recursive: true });
  const { encryptJson, guestData } = globalThis.TripShared;
  fs.writeFileSync(path.join(out, 'familie.enc.json'), JSON.stringify(await encryptJson({ ...trip, role: 'familie' }, familyPass)));
  fs.writeFileSync(path.join(out, 'gaeste.enc.json'), JSON.stringify(await encryptJson(guestData(trip), trip.meta.viewerPass)));
  console.log('Geschrieben: data/familie.enc.json, data/gaeste.enc.json');
})();
