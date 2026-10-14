// Registre des commandes : { name, alias?, cat, desc, use?, ... , run(ctx) }
const cmds = new Map();
const cats = [];
let rx = null, rxFor = -1;

function add(def) {
  for (const n of [def.name, ...(def.alias || [])]) cmds.set(n, def);
  if (!cats.includes(def.cat)) cats.push(def.cat);
}
const get = name => cmds.get(name);
const all = () => [...new Set(cmds.values())];
const total = () => all().length;

// Ajoute le préfixe devant les noms de commandes écrits en gras (*kick @user* -> *.kick @user*)
function prefixize(text, p) {
  if (typeof text !== 'string' || !text.includes('*')) return text;
  if (!rx || rxFor !== cmds.size) {
    const names = [...cmds.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    rx = new RegExp('(?<![\\w*])\\*(' + names.join('|') + ')(?=[\\s*:;,.)/]|$)', 'g');
    rxFor = cmds.size;
  }
  return text.replace(rx, (m, n) => '*' + p + n);
}
module.exports = { add, get, all, total, cats, prefixize };
