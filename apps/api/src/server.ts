import { randomBytes } from 'node:crypto';
import { openDb, syncUsers } from './db.ts';
import { createApp } from './app.ts';

const prod = process.env.NODE_ENV === 'production';
const secret = process.env.AUTH_SECRET || (prod ? '' : randomBytes(32).toString('hex'));
if (prod && secret.length < 32) { console.error('AUTH_SECRET es obligatorio en producción (mínimo 32 caracteres).'); process.exit(1); }

const db = openDb(process.env.DB_PATH || './data/dokan.db');
const { kept, removed } = syncUsers(db);   // solo existen los usuarios definidos en usuarios.ts
console.log(`Usuarios: ${kept} activos, ${removed} eliminados`);
const port = Number(process.env.PORT || 3000);
createApp({ db, secret, secureCookie: prod }).listen(port, () => console.log(`DOKAN listo en http://localhost:${port}`));
