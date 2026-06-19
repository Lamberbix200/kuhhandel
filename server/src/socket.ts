import type { Server, Socket } from 'socket.io';
import { AUCTION_SECONDS, GameError } from '@kuhhandel/shared';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { resolveIdentity, type Identity } from './identity';
import { RoomError, RoomManager, type Room } from './rooms';

const LOBBY = 'lobby';
/** Durée du compte à rebours d'une enchère, réinitialisée à chaque mise. */
const AUCTION_MS = AUCTION_SECONDS * 1000;

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: { identity: Identity };
};

export function registerSocketHandlers(io: IO): RoomManager {
  const manager = new RoomManager();
  /** Sockets actifs par utilisateur (plusieurs onglets possibles). */
  const userSockets = new Map<string, Set<ClientSocket>>();
  /** Minuteurs d'enchère par salon (clôture automatique + horodatage diffusé). */
  const auctionTimers = new Map<string, { timeout: NodeJS.Timeout; endsAt: number }>();

  const socketsOf = (userId: string): ClientSocket[] => [...(userSockets.get(userId) ?? [])];

  const emitToUser = <E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void => {
    for (const s of socketsOf(userId)) s.emit(event, ...args);
  };

  const broadcastLobby = (): void => {
    io.to(LOBBY).emit('lobby:rooms', manager.listOpenRooms());
  };

  /** Envoie à chaque membre sa vue du salon (champs propres à chacun). */
  const broadcastRoom = (room: Room): void => {
    for (const m of room.members) {
      emitToUser(m.userId, 'room:state', manager.roomViewFor(room, m.userId));
    }
  };

  /** Envoie à chaque membre sa vue de la partie (argent/offres masqués). */
  const broadcastGame = (room: Room): void => {
    if (!room.game) return;
    const inAuction = room.game.phase === 'auction';
    const endsAt = inAuction ? auctionTimers.get(room.id)?.endsAt ?? null : null;
    for (const m of room.members) {
      const view = manager.gameViewFor(room, m.userId);
      if (view) {
        view.auctionEndsAt = endsAt;
        emitToUser(m.userId, 'game:view', view);
      }
    }
  };

  const clearAuctionTimer = (roomId: string): void => {
    const t = auctionTimers.get(roomId);
    if (t) {
      clearTimeout(t.timeout);
      auctionTimers.delete(roomId);
    }
  };

  /** (Re)lance le compte à rebours : à l'échéance, le dernier enchérisseur l'emporte. */
  const startAuctionTimer = (room: Room): void => {
    clearAuctionTimer(room.id);
    const endsAt = Date.now() + AUCTION_MS;
    const timeout = setTimeout(() => {
      auctionTimers.delete(room.id);
      const updated = manager.resolveAuction(room.id);
      if (updated) {
        broadcastGame(updated);
        if (updated.status === 'finished') broadcastRoom(updated);
      }
    }, AUCTION_MS);
    // Ne maintient pas à lui seul la boucle d'événements (tests, arrêt propre).
    timeout.unref();
    auctionTimers.set(room.id, { timeout, endsAt });
  };

  io.on('connection', (raw: Socket) => {
    const socket = raw as ClientSocket;
    const identity = resolveIdentity(socket);
    socket.data.identity = identity;

    const set = userSockets.get(identity.userId) ?? new Set<ClientSocket>();
    set.add(socket);
    userSockets.set(identity.userId, set);

    // Reconnexion : si l'utilisateur était dans un salon, on le re-synchronise.
    const current = manager.setConnected(identity.userId, true);
    if (current) {
      socket.join(current.id);
      broadcastRoom(current);
      if (current.game) broadcastGame(current);
    }

    socket.on('lobby:subscribe', () => {
      socket.join(LOBBY);
      socket.emit('lobby:rooms', manager.listOpenRooms());
    });

    socket.on('lobby:unsubscribe', () => {
      socket.leave(LOBBY);
    });

    socket.on('room:create', ({ name }, ack) => {
      try {
        const room = manager.createRoom(identity, name);
        socket.join(room.id);
        socket.leave(LOBBY);
        ack({ ok: true, roomId: room.id });
        broadcastRoom(room);
        broadcastLobby();
      } catch (err) {
        ack({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('room:join', ({ code }, ack) => {
      try {
        const room = manager.joinRoom(code, identity);
        socket.join(room.id);
        socket.leave(LOBBY);
        ack({ ok: true, roomId: room.id });
        broadcastRoom(room);
        if (room.game) broadcastGame(room);
        broadcastLobby();
      } catch (err) {
        ack({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('room:leave', () => {
      const room = manager.leaveRoom(identity.userId);
      socket.leave(getRoomIdOf(socket));
      socket.emit('room:left');
      if (room) broadcastRoom(room);
      broadcastLobby();
    });

    socket.on('room:start', () => {
      try {
        const room = manager.startGame(identity.userId);
        broadcastRoom(room);
        broadcastGame(room);
        broadcastLobby();
      } catch (err) {
        socket.emit('error:msg', errorMessage(err));
      }
    });

    socket.on('game:action', (action) => {
      // RESOLVE_AUCTION est une action système (minuteur) : un client ne peut pas la forcer.
      if (action.type === 'RESOLVE_AUCTION') return;
      try {
        const room = manager.applyGameAction(identity.userId, action);
        // Synchronise le minuteur d'enchère avec la nouvelle phase :
        // - ouverture d'enchère ou nouvelle mise -> (re)lance le compte à rebours ;
        // - toute autre issue (clôture, paiement…) -> arrête le minuteur.
        if (room.game?.phase === 'auction' && (action.type === 'CHOOSE_AUCTION' || action.type === 'BID')) {
          startAuctionTimer(room);
        } else if (room.game?.phase !== 'auction') {
          clearAuctionTimer(room.id);
        }
        broadcastGame(room);
        if (room.status === 'finished') broadcastRoom(room);
      } catch (err) {
        if (err instanceof GameError || err instanceof RoomError) {
          socket.emit('error:msg', err.message);
        } else {
          throw err;
        }
      }
    });

    socket.on('chat:message', ({ text }) => {
      const room = manager.getRoomOfUser(identity.userId);
      if (!room) return;
      const payload = { from: identity.displayName, text: String(text).slice(0, 300), ts: Date.now() };
      for (const m of room.members) emitToUser(m.userId, 'chat:message', payload);
    });

    socket.on('chat:audio', ({ audio }) => {
      const room = manager.getRoomOfUser(identity.userId);
      if (!room) return;
      if (audio.byteLength > 500_000) return;
      const payload = { from: identity.displayName, audio, ts: Date.now() };
      for (const m of room.members) emitToUser(m.userId, 'chat:audio', payload);
    });

    socket.on('disconnect', () => {
      const set = userSockets.get(identity.userId);
      set?.delete(socket);
      if (!set || set.size === 0) {
        userSockets.delete(identity.userId);
        // Plus aucun onglet : on marque déconnecté (le slot reste en partie).
        const room = manager.setConnected(identity.userId, false);
        if (room) {
          broadcastRoom(room);
          if (room.game) broadcastGame(room);
        }
      }
    });
  });

  return manager;
}

function getRoomIdOf(socket: ClientSocket): string {
  // Les rooms Socket.IO incluent l'id du socket lui-même ; on prend l'autre.
  for (const r of socket.rooms) {
    if (r !== socket.id && r !== LOBBY) return r;
  }
  return '';
}

function errorMessage(err: unknown): string {
  if (err instanceof RoomError || err instanceof GameError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Erreur inconnue.';
}
