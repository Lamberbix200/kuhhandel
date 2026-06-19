import cookie from 'cookie';
import type { Socket } from 'socket.io';
import type { HandshakeAuth } from '@kuhhandel/shared';
import { COOKIE_NAME, verifyToken } from './auth';

/**
 * Identité d'un client connecté. C'est la SEULE abstraction dont dépendent
 * le lobby et le jeu. Aujourd'hui elle provient d'un invité (pseudo + id local) ;
 * quand l'auth par compte sera branchée, `resolveIdentity` validera le JWT du
 * handshake et renverra la même forme `{ userId, displayName }`. Rien d'autre
 * ne change en aval.
 */
export interface Identity {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

function sanitizeName(raw: unknown): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length === 0) return 'Joueur';
  return name.slice(0, 20);
}

function randomGuestId(): string {
  return `g_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Récupère le JWT depuis le handshake : `auth.token` explicite ou cookie httpOnly. */
function tokenFromHandshake(socket: Socket, auth: HandshakeAuth): string | null {
  if (auth.token) return String(auth.token);
  const header = socket.handshake.headers.cookie;
  if (!header) return null;
  return cookie.parse(header)[COOKIE_NAME] ?? null;
}

/**
 * Résout l'identité depuis le handshake Socket.IO.
 * Si un JWT valide est présent (cookie de session ou `auth.token`), on renvoie
 * l'utilisateur du compte ; sinon on retombe sur une identité invité.
 */
export function resolveIdentity(socket: Socket): Identity {
  const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;

  const token = tokenFromHandshake(socket, auth);
  if (token) {
    const claims = verifyToken(token);
    if (claims) {
      return {
        userId: `user:${claims.sub}`,
        displayName: sanitizeName(claims.name),
        isGuest: false,
      };
    }
  }

  const guestId = (auth.guestId && String(auth.guestId).trim()) || randomGuestId();
  return {
    userId: `guest:${guestId}`,
    displayName: sanitizeName(auth.displayName),
    isGuest: true,
  };
}
