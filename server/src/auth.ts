import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { prisma } from './db';

/** Nom du cookie httpOnly portant le JWT de session. */
export const COOKIE_NAME = 'kh_token';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours

/** Utilisateur exposé au client (jamais le hash du mot de passe). */
export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

/** Erreur métier d'authentification (message destiné à l'utilisateur). */
export class AuthError extends Error {}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerUser(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<AccountUser> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!EMAIL_RE.test(email)) throw new AuthError('Adresse email invalide.');
  if (displayName.length < 2) throw new AuthError('Le pseudo doit faire au moins 2 caractères.');
  if (input.password.length < 6) throw new AuthError('Le mot de passe doit faire au moins 6 caractères.');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AuthError('Un compte existe déjà avec cet email.');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({ data: { email, displayName, passwordHash } });
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function loginUser(input: { email: string; password: string }): Promise<AccountUser> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  // Comparaison même si l'utilisateur n'existe pas, pour limiter l'oracle de timing.
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await bcrypt.compare(input.password, hash);
  if (!user || !ok) throw new AuthError('Email ou mot de passe incorrect.');
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function signToken(user: AccountUser): string {
  return jwt.sign({ name: user.displayName, email: user.email }, config.jwtSecret, {
    subject: user.id,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export interface TokenClaims {
  sub: string;
  name: string;
  email?: string;
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'string') return null;
    if (!decoded.sub || typeof decoded.name !== 'string') return null;
    return {
      sub: String(decoded.sub),
      name: decoded.name,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  } catch {
    return null;
  }
}
