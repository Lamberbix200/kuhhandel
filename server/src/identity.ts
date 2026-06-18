import type { Socket } from 'socket.io';
import type { HandshakeAuth } from '@kuhhandel/shared';

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

/**
 * Résout l'identité depuis le handshake Socket.IO.
 * Point d'extension unique pour l'auth : si `auth.token` est présent et valide,
 * renvoyer l'utilisateur du compte au lieu d'un invité.
 */
export function resolveIdentity(socket: Socket): Identity {
  const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;

  // TODO (tâche #3) : si auth.token, vérifier le JWT et charger l'utilisateur.

  const guestId = (auth.guestId && String(auth.guestId).trim()) || randomGuestId();
  return {
    userId: `guest:${guestId}`,
    displayName: sanitizeName(auth.displayName),
    isGuest: true,
  };
}
