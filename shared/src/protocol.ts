import type { GameAction, PlayerView } from './engine';

/**
 * Contrat d'événements Socket.IO partagé client/serveur.
 * Toute information cachée est déjà retirée par `viewFor` côté serveur ;
 * ces types ne transportent donc jamais l'argent ou les offres d'autrui.
 */

export type RoomStatus = 'waiting' | 'in_game' | 'finished';

/** Résumé d'un salon affiché dans le lobby (liste des salons ouverts). */
export interface RoomSummary {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}

export interface RoomMemberView {
  userId: string;
  displayName: string;
  connected: boolean;
  isHost: boolean;
}

/** État d'un salon, vu par un membre donné (salle d'attente). */
export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  members: RoomMemberView[];
  hostId: string;
  youAreHost: boolean;
  /** Le membre courant peut-il démarrer la partie ? (hôte + effectif valide) */
  canStart: boolean;
  minPlayers: number;
  maxPlayers: number;
}

/** Réponse standardisée d'un accusé de réception (ack). */
export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  'room:state': (room: RoomView) => void;
  'room:left': () => void;
  'game:view': (view: PlayerView) => void;
  /** Erreur non bloquante (coup illégal, etc.) destinée au joueur fautif. */
  'error:msg': (message: string) => void;
}

export interface ClientToServerEvents {
  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
  'room:create': (payload: { name: string }, ack: (res: Ack<{ roomId: string }>) => void) => void;
  'room:join': (payload: { code: string }, ack: (res: Ack<{ roomId: string }>) => void) => void;
  'room:leave': () => void;
  'room:start': () => void;
  'game:action': (action: GameAction) => void;
}

/** Données transmises au handshake (identité). Invité aujourd'hui, JWT demain. */
export interface HandshakeAuth {
  displayName?: string;
  /** Identifiant invité stable, persisté côté client pour les reconnexions. */
  guestId?: string;
  /** Jeton de session (ajouté quand l'auth par compte sera branchée). */
  token?: string;
}
