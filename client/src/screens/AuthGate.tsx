import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useSocket } from '../socket';
import { Button, Card } from '../ui';

type Mode = 'login' | 'register' | 'guest';

const inputClass =
  'w-full rounded-xl bg-parchment px-4 py-3 text-felt-900 placeholder:text-felt-900/40 focus:outline-none focus:ring-2 focus:ring-brass-500';

export function AuthGate() {
  const { login, register } = useAuth();
  const { setPseudo } = useSocket();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else if (mode === 'register') await register(email.trim(), displayName.trim(), password);
      else {
        const clean = guestName.trim();
        if (clean.length < 2) throw new Error('Le pseudo doit faire au moins 2 caractères.');
        setPseudo(clean);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  const Tab = ({ value, label }: { value: Mode; label: string }) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        mode === value ? 'bg-brass-500 text-felt-900' : 'bg-felt-800/60 text-parchment/70 hover:bg-felt-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-7">
        <div className="mb-1 text-center text-5xl">🐮💰</div>
        <h1 className="text-center font-display text-3xl font-bold text-brass-500">Kuhhandel</h1>
        <p className="mb-5 mt-1 text-center text-sm text-parchment/70">
          Le marchandage de bestiaux, en ligne.
        </p>

        {mode !== 'guest' && (
          <div className="mb-4 flex gap-2">
            <Tab value="login" label="Connexion" />
            <Tab value="register" label="Inscription" />
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'guest' ? (
            <input
              autoFocus
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={20}
              className={inputClass}
            />
          ) : (
            <>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputClass}
              />
              {mode === 'register' && (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Pseudo (visible en jeu)"
                  maxLength={20}
                  className={inputClass}
                />
              )}
              <input
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className={inputClass}
              />
            </>
          )}

          {error && <p className="text-sm text-red-300">⚠️ {error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {mode === 'login' ? 'Se connecter' : mode === 'register' ? "S'inscrire" : 'Jouer en invité'}
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-parchment/60">
          {mode === 'guest' ? (
            <button onClick={() => setMode('login')} className="underline-offset-2 hover:underline">
              ← Revenir à la connexion
            </button>
          ) : (
            <button onClick={() => setMode('guest')} className="underline-offset-2 hover:underline">
              Jouer en invité (sans compte) →
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
