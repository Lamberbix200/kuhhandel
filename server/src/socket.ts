import type { Server, Socket } from 'socket.io';
import { GameError } from '@kuhhandel/shared';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { resolveIdentity, type Identity } from './identity';
import { RoomError, RoomManager, type Room } from './rooms';

const LOBBY = 'lobby';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: { identity: Identity };
};

export function registerSocketHandlers(io: IO): RoomManager {
  const manager = new RoomManager();
  /** Sockets actifs par utilisateur (plusieurs onglets possibles). */
  const userSockets = new Map<string, Set<ClientSocket>>();

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
    for (const m of room.members) {
      const view = manager.gameViewFor(room, m.userId);
      if (view) emitToUser(m.userId, 'game:view', view);
    }
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
      try {
        const room = manager.applyGameAction(identity.userId, action);
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
