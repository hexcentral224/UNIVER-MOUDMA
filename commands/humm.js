const { add } = require('../core/registry');
const { viewOnce } = require('../lib/helpers');

// Silencieux : aucun message dans la discussion, le média arrive directement en privé.
add({ name: 'humm', cat: 'media', desc: 'récupérer un média « vue unique » en privé, sans bruit', use: 'humm  (en répondant à un média vue unique)', silent: true, run: ctx => viewOnce(ctx, true) });
