import { useState } from 'react';
import { useSocket } from '../socket';
import { Button, Card } from '../ui';

export function PseudoGate() {
  const { setPseudo } = useSocket();
  const [name, setName] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length >= 2) setPseudo(clean);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-7 text-center">
        <div className="mb-2 text-5xl">🐮💰</div>
        <h1 className="font-display text-3xl font-bold text-brass-500">Kuhhandel</h1>
        <p className="mt-1 mb-6 text-sm text-parchment/70">
          Le marchandage de bestiaux, en ligne. Bluffe, enchéris, complète tes familles.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={20}
            className="w-full rounded-xl bg-parchment px-4 py-3 text-center text-felt-900 placeholder:text-felt-900/40 focus:outline-none focus:ring-2 focus:ring-brass-500"
          />
          <Button type="submit" disabled={name.trim().length < 2} className="w-full">
            Entrer
          </Button>
        </form>
        <p className="mt-4 text-xs text-parchment/50">
          Mode invité — les comptes arrivent bientôt.
        </p>
      </Card>
    </div>
  );
}
