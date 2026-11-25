import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const prefix = 'scrypt$v1$131072$8$1';
const validInput = (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 1024;

export async function hashPassword(password) {
  if (!validInput(password) || [...password].length < 12) throw new RangeError('La contraseña debe tener al menos 12 caracteres y hasta 1024 bytes');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, options);
  return `${prefix}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (!validInput(password) || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts.slice(0, 5).join('$') !== prefix || !/^[0-9a-f]{32}$/.test(parts[5]) || !/^[0-9a-f]{64}$/.test(parts[6])) return false;
  const expected = Buffer.from(parts[6], 'hex');
  const actual = await derive(password, Buffer.from(parts[5], 'hex'), 32, options);
  return timingSafeEqual(actual, expected);
}
