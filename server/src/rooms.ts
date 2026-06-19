import {
  applyAction,
  createGame,
  MAX_PLAYERS,
  MIN_PLAYERS,
  viewFor,
} from '@kuhhandel/shared';
import type {
  GameAction,
  GameState,
  PlayerView,
  RoomStatus,
  RoomSummary,
  RoomView,
} from '@kuhhandel/shared';

/** Erreur métier liée aux salons (transmise au client fautif). */
export class RoomError extends Error {}

export interface RoomMember {
  userId: string;
  displayName: string;
  connected: boolean;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  members: RoomMember[];
  status: RoomStatus;
  game: GameState | null;
  createdAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1 ambigus
const CODE_LENGTH = 4;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Gère l'ensemble des salons en mémoire. Aucune dépendance réseau :
 * renvoie des données, la couche Socket.IO s'occupe de la diffusion.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  /** Salon (unique) dont l'utilisateur est membre, le cas échéant. */
  getRoomOfUser(userId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => m.userId === userId)) return room;
    }
    return undefined;
  }

  /** Salons ouverts (en attente) listés dans le lobby. */
  listOpenRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'waiting')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => this.toSummary(r));
  }

  createRoom(host: { userId: string; displayName: string }, name: string): Room {
    if (this.getRoomOfUser(host.userId)) {
      throw new RoomError('Tu es déjà dans un salon.');
    }
    const cleanName = name.trim().slice(0, 30) || `Salon de ${host.displayName}`;
    let id = randomCode();
    while (this.rooms.has(id)) id = randomCode();

    const room: Room = {
      id,
      name: cleanName,
      hostId: host.userId,
      members: [{ userId: host.userId, displayName: host.displayName, connected: true }],
      status: 'waiting',
      game: null,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(code: string, member: { userId: string; displayName: string }): Room {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new RoomError("Ce salon n'existe pas.");
    if (room.status !== 'waiting') throw new RoomError('La partie a déjà commencé.');

    const existing = room.members.find((m) => m.userId === member.userId);
    if (existing) {
      existing.connected = true;
      existing.displayName = member.displayName;
      return room;
    }
    if (room.members.length >= MAX_PLAYERS) throw new RoomError('Ce salon est complet.');

    const otherRoom = this.getRoomOfUser(member.userId);
    if (otherRoom && otherRoom.id !== room.id) {
      throw new RoomError('Tu es déjà dans un autre salon.');
    }
    room.members.push({ userId: member.userId, displayName: member.displayName, connected: true });
    return room;
  }

  /** Quitte le salon. En partie, l'utilisateur est marqué déconnecté (le slot reste). */
  leaveRoom(userId: string): Room | undefined {
    const room = this.getRoomOfUser(userId);
    if (!room) return undefined;

    if (room.status === 'waiting') {
      room.members = room.members.filter((m) => m.userId !== userId);
      if (room.members.length === 0) {
        this.rooms.delete(room.id);
        return undefined;
      }
      if (room.hostId === userId) room.hostId = room.members[0]!.userId;
      return room;
    }

    // En partie : on conserve le slot mais on déconnecte.
    this.setConnected(userId, false);
    return room;
  }

  /** Met à jour l'état de connexion dans le salon ET dans la partie. */
  setConnected(userId: string, connected: boolean): Room | undefined {
    const room = this.getRoomOfUser(userId);
    if (!room) return undefined;
    const member = room.members.find((m) => m.userId === userId);
    if (member) member.connected = connected;
    if (room.game) {
      const player = room.game.players.find((p) => p.id === userId);
      if (player) player.connected = connected;
    }
    return room;
  }

  startGame(userId: string): Room {
    const room = this.getRoomOfUser(userId);
    if (!room) throw new RoomError("Tu n'es dans aucun salon.");
    if (room.hostId !== userId) throw new RoomError("Seul l'hôte peut démarrer la partie.");
    if (room.status !== 'waiting') throw new RoomError('La partie est déjà lancée.');
    if (room.members.length < MIN_PLAYERS) {
      throw new RoomError(`Il faut au moins ${MIN_PLAYERS} joueurs.`);
    }
    if (room.members.length > MAX_PLAYERS) {
      throw new RoomError(`Pas plus de ${MAX_PLAYERS} joueurs.`);
    }
    const game = createGame(room.members.map((m) => ({ id: m.userId, name: m.displayName })));
    room.game = applyAction(game, room.members[0]!.userId, { type: 'START' });
    room.status = 'in_game';
    return room;
  }

  applyGameAction(userId: string, action: GameAction): Room {
    const room = this.getRoomOfUser(userId);
    if (!room) throw new RoomError("Tu n'es dans aucun salon.");
    if (room.status !== 'in_game' || !room.game) throw new RoomError("Aucune partie en cours.");
    // applyAction lève GameError sur coup illégal — propagé tel quel.
    room.game = applyAction(room.game, userId, action);
    if (room.game.phase === 'finished') room.status = 'finished';
    return room;
  }

  /**
   * Clôture l'enchère d'un salon (déclenchée par l'expiration du minuteur serveur).
   * Action système : appliquée au nom du meneur, jamais à la demande d'un client.
   * Renvoie undefined si le salon n'est plus en phase d'enchère (course bénigne).
   */
  resolveAuction(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room || !room.game || room.game.phase !== 'auction') return undefined;
    const leaderId = room.game.players[room.game.leaderIndex]?.id;
    if (!leaderId) return undefined;
    room.game = applyAction(room.game, leaderId, { type: 'RESOLVE_AUCTION' });
    if (room.game.phase === 'finished') room.status = 'finished';
    return room;
  }

  toSummary(room: Room): RoomSummary {
    const host = room.members.find((m) => m.userId === room.hostId);
    return {
      id: room.id,
      name: room.name,
      hostName: host?.displayName ?? '—',
      playerCount: room.members.length,
      maxPlayers: MAX_PLAYERS,
      status: room.status,
    };
  }

  roomViewFor(room: Room, userId: string): RoomView {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      members: room.members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        connected: m.connected,
        isHost: m.userId === room.hostId,
      })),
      hostId: room.hostId,
      youAreHost: room.hostId === userId,
      canStart:
        room.hostId === userId &&
        room.status === 'waiting' &&
        room.members.length >= MIN_PLAYERS &&
        room.members.length <= MAX_PLAYERS,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  gameViewFor(room: Room, userId: string): PlayerView | null {
    if (!room.game) return null;
    return viewFor(room.game, userId);
  }
}
