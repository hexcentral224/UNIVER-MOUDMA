// Chargeur automatique : chaque fichier de ce dossier = une commande.
// Pour ajouter une commande, dépose simplement un nouveau fichier ici.
const fs = require('fs');
const path = require('path');
for (const f of fs.readdirSync(__dirname).sort()) {
  if (f === 'index.js' || !f.endsWith('.js')) continue;
  try { require(path.join(__dirname, f)); }
  catch (e) { console.error(`❌ Commande ${f} non chargée :`, e.message); }
}
