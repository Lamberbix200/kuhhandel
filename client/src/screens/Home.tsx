import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../socket';
import { Button, Card, Spinner } from '../ui';

export function Home() {
  const {
    connected,
    pseudo,
    setPseudo,
    lobbyRooms,
    roomView,
    subscribeLobby,
    unsubscribeLobby,
    createRoom,
    joinRoom,
  } = useSocket();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    subscribeLobby();
    return () => unsubscribeLobby();
  }, [subscribeLobby, unsubscribeLobby]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const id = await createRoom(roomName);
      navigate(`/room/${id}`);
    } catch {
      /* l'erreur est affichée par le toast global */
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (joinCode: string) => {
    setBusy(true);
    try {
      const id = await joinRoom(joinCode);
      navigate(`/room/${id}`);
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-brass-500">🐮 Kuhhandel</h1>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
            title={connected ? 'Connecté' : 'Déconnecté'}
          />
          <span className="text-parchment/80">{pseudo}</span>
          <button
            onClick={() => setPseudo('')}
            className="text-parchment/50 underline-offset-2 hover:underline"
          >
            changer
          </button>
        </div>
      </header>

      {roomView && (
        <Card className="mb-5 flex items-center justify-between p-4">
          <span className="text-sm">
            Tu es dans le salon <b className="font-mono text-brass-500">{roomView.id}</b>.
          </span>
          <Button onClick={() => navigate(`/room/${roomView.id}`)}>Rejoindre</Button>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* Créer / rejoindre */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Nouvelle partie</h2>
          <label className="mb-1 block text-xs text-parchment/60">Nom du salon (optionnel)</label>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder={`Salon de ${pseudo}`}
            maxLength={30}
            className="mb-3 w-full rounded-lg bg-parchment px-3 py-2 text-felt-900 placeholder:text-felt-900/40 focus:outline-none focus:ring-2 focus:ring-brass-500"
          />
          <Button onClick={handleCreate} disabled={busy || !connected} className="w-full">
            Créer un salon
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-parchment/40">
            <span className="h-px flex-1 bg-parchment/15" /> ou <span className="h-px flex-1 bg-parchment/15" />
          </div>

          <label className="mb-1 block text-xs text-parchment/60">Rejoindre par code</label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={4}
              className="w-28 rounded-lg bg-parchment px-3 py-2 text-center font-mono text-lg tracking-widest text-felt-900 placeholder:text-felt-900/30 focus:outline-none focus:ring-2 focus:ring-brass-500"
            />
            <Button
              variant="secondary"
              onClick={() => handleJoin(code)}
              disabled={busy || code.length < 4 || !connected}
              className="flex-1"
            >
              Rejoindre
            </Button>
          </div>
        </Card>

        {/* Salons ouverts */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">
            Salons ouverts {lobbyRooms.length > 0 && `(${lobbyRooms.length})`}
          </h2>
          {!connected ? (
            <div className="flex items-center gap-2 text-parchment/60">
              <Spinner /> Connexion…
            </div>
          ) : lobbyRooms.length === 0 ? (
            <p className="text-sm text-parchment/50">
              Aucun salon ouvert. Crée le premier !
            </p>
          ) : (
            <ul className="space-y-2">
              {lobbyRooms.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg bg-felt-800/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-parchment/50">
                      <span className="font-mono">{r.id}</span> · hôte {r.hostName} · {r.playerCount}/
                      {r.maxPlayers}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => handleJoin(r.id)}
                    disabled={busy || r.playerCount >= r.maxPlayers}
                    className="shrink-0 px-3 py-1.5 text-sm"
                  >
                    {r.playerCount >= r.maxPlayers ? 'Complet' : 'Rejoindre'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
