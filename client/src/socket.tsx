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
  ChatEntry,
  ClientToServerEvents,
  GameAction,
  PlayerView,
  RoomSummary,
  RoomView,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { getGuestId, getStoredPseudo, storePseudo } from './identity';
import { useAuth } from './auth';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  connected: boolean;
  pseudo: string;
  setPseudo: (pseudo: string) => void;
  lobbyRooms: RoomSummary[];
  roomView: RoomView | null;
  gameView: PlayerView | null;
  chatMessages: ChatEntry[];
  error: string | null;
  clearError: () => void;
  subscribeLobby: () => void;
  unsubscribeLobby: () => void;
  createRoom: (name: string) => Promise<string>;
  joinRoom: (code: string) => Promise<string>;
  leaveRoom: () => void;
  startGame: () => void;
  sendAction: (action: GameAction) => void;
  sendChatMessage: (text: string) => void;
  sendChatAudio: (audio: ArrayBuffer) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pseudo, setPseudoState] = useState<string>(getStoredPseudo());
  const [connected, setConnected] = useState(false);
  const [lobbyRooms, setLobbyRooms] = useState<RoomSummary[]>([]);
  const [roomView, setRoomView] = useState<RoomView | null>(null);
  const [gameView, setGameView] = useState<PlayerView | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);

  // Connecte le socket dès qu'on a une identité : compte (cookie de session porté
  // par withCredentials) ou, à défaut, invité (guestId + pseudo). On reconnecte
  // quand l'identité change (connexion / déconnexion / changement de pseudo).
  useEffect(() => {
    if (!user && !pseudo) return;
    const socket: AppSocket = io({
      withCredentials: true,
      auth: user
        ? { displayName: user.displayName }
        : { guestId: getGuestId(), displayName: pseudo },
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('lobby:rooms', setLobbyRooms);
    socket.on('room:state', setRoomView);
    socket.on('room:left', () => {
      setRoomView(null);
      setGameView(null);
      setChatMessages([]);
    });
    socket.on('game:view', setGameView);
    socket.on('error:msg', (msg) => setError(msg));
    socket.on('chat:message', (msg) => setChatMessages((prev) => [...prev, { kind: 'text', ...msg }]));
    socket.on('chat:audio', (msg) => setChatMessages((prev) => [...prev, { kind: 'audio', ...msg }]));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setRoomView(null);
      setGameView(null);
      setChatMessages([]);
    };
    // Clé d'identité : reconnecte si le compte ou le pseudo invité change.
  }, [user?.id, pseudo]);

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
  const sendChatMessage = useCallback((text: string) => socketRef.current?.emit('chat:message', { text }), []);
  const sendChatAudio = useCallback((audio: ArrayBuffer) => socketRef.current?.emit('chat:audio', { audio }), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<SocketContextValue>(
    () => ({
      connected,
      pseudo,
      setPseudo,
      lobbyRooms,
      roomView,
      gameView,
      chatMessages,
      error,
      clearError,
      subscribeLobby,
      unsubscribeLobby,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      sendAction,
      sendChatMessage,
      sendChatAudio,
    }),
    [
      connected,
      pseudo,
      setPseudo,
      lobbyRooms,
      roomView,
      gameView,
      chatMessages,
      error,
      clearError,
      subscribeLobby,
      unsubscribeLobby,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      sendAction,
      sendChatMessage,
      sendChatAudio,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket doit être utilisé dans <SocketProvider>.');
  return ctx;
}
