import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const hashPassword = (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
};
export const verifyPassword = (pw: string, stored: string) => {
  const [, salt, hash] = stored.split('$');
  const a = Buffer.from(hash, 'hex'), b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};

const mac = (p: string, secret: string) => createHmac('sha256', secret).update(p).digest('base64url');
export const sign = (payload: object, secret: string) => {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${p}.${mac(p, secret)}`;
};
export const verify = (token: string, secret: string): any => {
  const [p, m] = token.split('.');
  if (!p || !m) return null;
  const e = mac(p, secret);
  if (m.length !== e.length || !timingSafeEqual(Buffer.from(m), Buffer.from(e))) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d : null; }
  catch { return null; }
};

// Límite de intentos fallidos de login (por correo + IP)
export const makeLimiter = (max: number, windowMs: number) => {
  const hits = new Map<string, { n: number; reset: number }>();
  const get = (k: string) => { const h = hits.get(k); if (h && h.reset > Date.now()) return h; hits.delete(k); return null; };
  return {
    blocked: (k: string) => (get(k)?.n ?? 0) >= max,
    fail: (k: string) => { const h = get(k) ?? { n: 0, reset: Date.now() + windowMs }; h.n++; hits.set(k, h); },
    reset: (k: string) => { hits.delete(k); },
  };
};
