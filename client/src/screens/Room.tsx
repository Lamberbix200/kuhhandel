import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../socket';
import { Button, Card, Spinner } from '../ui';
import { GameBoard } from '../game/GameBoard';

function WaitingRoom({ code }: { code: string }) {
  const { roomView, startGame, leaveRoom } = useSocket();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  if (!roomView) return null;

  const shareUrl = `${window.location.origin}/room/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const leave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Card className="p-6">
        <div className="mb-4 text-center">
          <p className="text-sm text-parchment/60">{roomView.name}</p>
          <p className="font-display text-4xl font-bold tracking-[0.3em] text-brass-500">
            {roomView.id}
          </p>
        </div>

        <div className="mb-5 rounded-xl bg-felt-800/60 p-3">
          <p className="mb-2 text-xs text-parchment/60">Invite tes amis avec ce lien :</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 rounded-lg bg-parchment/90 px-3 py-2 text-sm text-felt-900"
            />
            <Button onClick={copy} className="shrink-0 px-3 py-2 text-sm">
              {copied ? '✓ Copié' : 'Copier'}
            </Button>
          </div>
        </div>

        <h2 className="mb-2 font-display text-lg font-semibold">
          Joueurs ({roomView.members.length}/{roomView.maxPlayers})
        </h2>
        <ul className="mb-5 space-y-1.5">
          {roomView.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-2 rounded-lg bg-felt-800/40 px-3 py-2"
            >
              <span
                className={`h-2 w-2 rounded-full ${m.connected ? 'bg-green-400' : 'bg-stone-500'}`}
              />
              <span className="flex-1">{m.displayName}</span>
              {m.isHost && (
                <span className="rounded-full bg-brass-500/20 px-2 py-0.5 text-xs text-brass-500">
                  hôte
                </span>
              )}
            </li>
          ))}
        </ul>

        {roomView.youAreHost ? (
          <Button onClick={startGame} disabled={!roomView.canStart} className="w-full">
            {roomView.members.length < roomView.minPlayers
              ? `En attente de joueurs (min. ${roomView.minPlayers})`
              : 'Démarrer la partie'}
          </Button>
        ) : (
          <p className="py-2 text-center text-sm text-parchment/60">
            En attente que l'hôte démarre la partie…
          </p>
        )}

        <button
          onClick={leave}
          className="mt-3 w-full text-center text-sm text-parchment/50 hover:underline"
        >
          Quitter le salon
        </button>
      </Card>
    </div>
  );
}

export function Room() {
  const { code = '' } = useParams();
  const { roomView, gameView, joinRoom } = useSocket();
  const navigate = useNavigate();
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (!code) return;
    if (roomView?.id === code) return;
    if (joinAttempted.current) return;
    joinAttempted.current = true;
    joinRoom(code).catch(() => navigate('/', { replace: true }));
  }, [code, roomView?.id, joinRoom, navigate]);

  if (!roomView || roomView.id !== code) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-parchment/70">
        <Spinner /> Connexion au salon {code}…
      </div>
    );
  }

  if (roomView.status === 'waiting') return <WaitingRoom code={code} />;
  if (!gameView) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-parchment/70">
        <Spinner /> Chargement de la partie…
      </div>
    );
  }
  return <GameBoard />;
}
