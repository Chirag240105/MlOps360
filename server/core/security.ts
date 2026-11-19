import crypto from 'node:crypto';
import {UnauthorizedError} from './errors.ts';

export type UserRole = 'Admin' | 'ML_Engineer' | 'Viewer';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signJwt(
  claims: {sub: string; email: string; role: UserRole},
  secret: string,
  expiresInMinutes = 60,
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    ...claims,
    iat: nowSec,
    exp: nowSec + Math.round(expiresInMinutes * 60),
  };
  const headerB64 = base64UrlEncode(JSON.stringify({alg: 'HS256', typ: 'JWT'}));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', secret).update(signingInput).digest());

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const actualBuf = Buffer.from(sigB64, 'utf8');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new UnauthorizedError('Invalid token signature');
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid token payload');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) {
    throw new UnauthorizedError('Token expired');
  }
  return payload;
}
