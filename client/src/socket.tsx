import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GameAction,
  PlayerView,
  RoomSummary,
  RoomView,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { getGuestId, getStoredPseudo, storePseudo } from './identity';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  connected: boolean;
  pseudo: string;
  setPseudo: (pseudo: string) => void;
  lobbyRooms: RoomSummary[];
  roomView: RoomView | null;
  gameView: PlayerView | null;
  error: string | null;
  clearError: () => void;
  subscribeLobby: () => void;
  unsubscribeLobby: () => void;
  createRoom: (name: string) => Promise<string>;
  joinRoom: (code: string) => Promise<string>;
  leaveRoom: () => void;
  startGame: () => void;
  sendAction: (action: GameAction) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [pseudo, setPseudoState] = useState<string>(getStoredPseudo());
  const [connected, setConnected] = useState(false);
  const [lobbyRooms, setLobbyRooms] = useState<RoomSummary[]>([]);
  const [roomView, setRoomView] = useState<RoomView | null>(null);
  const [gameView, setGameView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    if (!pseudo) return;
    const socket: AppSocket = io({
      auth: { guestId: getGuestId(), displayName: pseudo },
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('lobby:rooms', setLobbyRooms);
    socket.on('room:state', setRoomView);
    socket.on('room:left', () => {
      setRoomView(null);
      setGameView(null);
    });
    socket.on('game:view', setGameView);
    socket.on('error:msg', (msg) => setError(msg));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [pseudo]);

  const setPseudo = useCallback((name: string) => {
    storePseudo(name);
    setPseudoState(name.trim().slice(0, 20));
  }, []);

  const subscribeLobby = useCallback(() => socketRef.current?.emit('lobby:subscribe'), []);
  const unsubscribeLobby = useCallback(() => socketRef.current?.emit('lobby:unsubscribe'), []);

  const createRoom = useCallback(
    (name: string) =>
      new Promise<string>((resolve, reject) => {
        const s = socketRef.current;
        if (!s) return reject(new Error('Non connecté.'));
        s.emit('room:create', { name }, (res) =>
          res.ok ? resolve(res.roomId) : reject(new Error(res.error)),
        );
      }),
    [],
  );

  const joinRoom = useCallback(
    (code: string) =>
      new Promise<string>((resolve, reject) => {
        const s = socketRef.current;
        if (!s) return reject(new Error('Non connecté.'));
        s.emit('room:join', { code }, (res) =>
          res.ok ? resolve(res.roomId) : reject(new Error(res.error)),
        );
      }),
    [],
  );

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setRoomView(null);
    setGameView(null);
  }, []);

  const startGame = useCallback(() => socketRef.current?.emit('room:start'), []);
  const sendAction = useCallback((action: GameAction) => socketRef.current?.emit('game:action', action), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<SocketContextValue>(
    () => ({
      connected,
      pseudo,
      setPseudo,
      lobbyRooms,
      roomView,
      gameView,
      error,
      clearError,
      subscribeLobby,
      unsubscribeLobby,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      sendAction,
    }),
    [
      connected,
      pseudo,
      setPseudo,
      lobbyRooms,
      roomView,
      gameView,
      error,
      clearError,
      subscribeLobby,
      unsubscribeLobby,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      sendAction,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket doit être utilisé dans <SocketProvider>.');
  return ctx;
}
