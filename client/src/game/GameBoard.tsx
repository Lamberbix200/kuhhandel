import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AnimalId, Money, PlayerView, PublicPlayer } from '@kuhhandel/shared';
import { ANIMALS, ANIMAL_BY_ID, BID_INCREMENT, moneyValue } from '@kuhhandel/shared';
import { useSocket } from '../socket';
import { Button, Card } from '../ui';
import { MoneyPicker } from './MoneyPicker';
import { AnimalCard, CardBack, MoneyCard } from './cards';
import { Countdown } from './Countdown';
import { EventBanner } from './EventBanner';
import * as sound from '../sound';

/** Score à partir des seules familles complètes (l'argent ne compte pas). */
function familiesScore(animals: Record<AnimalId, number>): number {
  const fams = ANIMALS.filter((a) => animals[a.id] === 4);
  return fams.reduce((s, a) => s + a.value, 0) * fams.length;
}

function nameOf(view: PlayerView, id: string | null): string {
  if (!id) return '—';
  if (id === view.you.id) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '—';
}

function tradeTargetsFor(view: PlayerView): { player: PublicPlayer; animals: AnimalId[] }[] {
  const mine = view.you.animals;
  return view.players
    .filter((p) => p.id !== view.you.id && p.connected)
    .map((p) => ({
      player: p,
      animals: ANIMALS.filter((a) => mine[a.id] > 0 && p.animals[a.id] > 0).map((a) => a.id),
    }))
    .filter((t) => t.animals.length > 0);
}

/** Main d'animaux : une carte par famille possédée (avec compteur), familles complètes mises en valeur. */
function AnimalsHand({ animals, size = 'md' }: { animals: Record<AnimalId, number>; size?: 'sm' | 'md' }) {
  const owned = ANIMALS.filter((a) => animals[a.id] > 0);
  if (owned.length === 0) return <span className="text-xs text-parchment/40">aucun animal</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {owned.map((a) => (
        <div key={a.id} className={animals[a.id] === 4 ? 'rounded-lg ring-2 ring-brass-500' : ''}>
          <AnimalCard id={a.id} size={size} count={animals[a.id]} />
        </div>
      ))}
    </div>
  );
}

/** Ta liasse d'argent en cartes (visible uniquement par toi). */
function MoneyHand({ money }: { money: Money }) {
  const present = ([0, 10, 50, 100, 200, 500] as const).filter((d) => money[d] > 0);
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {present.map((d) => (
        <MoneyCard key={d} denom={d} size="md" count={money[d]} />
      ))}
      <span className="ml-1 shrink-0 self-center text-sm text-parchment/60">= {moneyValue(money)}</span>
    </div>
  );
}

/* ----------------------------- Scène d'enchère ----------------------------- */

function AuctionStage({ view }: { view: PlayerView }) {
  const a = view.auction!;
  return (
    <div className="mb-3 flex flex-col items-center gap-3">
      <div className="relative">
        <div key={a.animal} className="kh-flip" style={{ perspective: 600 }}>
          <AnimalCard id={a.animal} size="lg" />
        </div>
        {view.phase === 'auction_decision' && (
          <div className="kh-stamp pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md border-4 border-red-600 px-2 py-0.5 font-display text-xl font-extrabold uppercase text-red-600">
              Adjugé&nbsp;!
            </span>
          </div>
        )}
      </div>
      {view.phase === 'auction' && view.auctionEndsAt != null && (
        <Countdown endsAt={view.auctionEndsAt} />
      )}
    </div>
  );
}

/* ----------------------------- Phases d'action ----------------------------- */

function BidControls({ view }: { view: PlayerView }) {
  const { sendAction } = useSocket();
  const a = view.auction!;
  const min = a.highestBid + BID_INCREMENT;
  const max = moneyValue(view.you.money);
  const [amount, setAmount] = useState(min);

  useEffect(() => {
    setAmount((cur) => Math.max(cur, a.highestBid + BID_INCREMENT));
  }, [a.highestBid]);

  const canAfford = max >= min;
  const valid = amount >= min && amount <= max && amount % BID_INCREMENT === 0;

  if (!canAfford) {
    return (
      <p className="text-center text-sm text-parchment/70">
        Tu ne peux pas suivre (il faudrait au moins {min}). En attente de la fin du compte à rebours…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setAmount((x) => Math.max(min, x - BID_INCREMENT))}
          className="h-11 w-11 rounded-lg bg-felt-700 text-2xl active:scale-95"
        >
          −
        </button>
        <span className="w-24 text-center font-display text-3xl font-bold text-brass-500">{amount}</span>
        <button
          onClick={() => setAmount((x) => Math.min(max, x + BID_INCREMENT))}
          className="h-11 w-11 rounded-lg bg-felt-700 text-2xl active:scale-95"
        >
          +
        </button>
      </div>
      <Button onClick={() => sendAction({ type: 'BID', amount })} disabled={!valid} className="w-full text-lg">
        🔨 Miser {amount}
      </Button>
    </div>
  );
}

function TradeInitiator({ view, onCancel }: { view: PlayerView; onCancel: () => void }) {
  const { sendAction } = useSocket();
  const targets = tradeTargetsFor(view);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [animal, setAnimal] = useState<AnimalId | null>(null);

  const target = targets.find((t) => t.player.id === targetId) ?? null;

  if (targetId && animal && target) {
    const special = view.you.animals[animal] >= 2 && target.player.animals[animal] >= 2;
    return (
      <div className="space-y-3">
        <p className="text-center text-sm">
          Offre secrète pour <b>{ANIMAL_BY_ID[animal].name}</b> à <b>{target.player.name}</b>
          {special && <span className="text-brass-500"> (marchandage double !)</span>}
        </p>
        <p className="text-center text-xs text-parchment/50">
          Bluff autorisé : tu peux poser des cartes « Bluff » (0) ou rien du tout.
        </p>
        <MoneyPicker
          hand={view.you.money}
          allowEmpty
          confirmLabel="Proposer"
          onConfirm={(offer) => sendAction({ type: 'CHOOSE_TRADE', targetId, animal, offer })}
          onCancel={() => setAnimal(null)}
        />
      </div>
    );
  }

  if (targetId && target) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm">Quel animal veux-tu lui prendre ?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {target.animals.map((id) => (
            <button key={id} onClick={() => setAnimal(id)} className="active:scale-95">
              <AnimalCard id={id} size="md" />
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setTargetId(null)} className="w-full text-sm">
          ← Changer d'adversaire
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm">Avec qui veux-tu marchander ?</p>
      <div className="space-y-2">
        {targets.map((t) => (
          <button
            key={t.player.id}
            onClick={() => setTargetId(t.player.id)}
            className="flex w-full items-center justify-between rounded-lg bg-felt-800/70 px-3 py-2 hover:bg-felt-700"
          >
            <span>{t.player.name}</span>
            <span className="flex gap-1">
              {t.animals.map((id) => (
                <AnimalCard key={id} id={id} size="sm" />
              ))}
            </span>
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={onCancel} className="w-full text-sm">
        Annuler
      </Button>
    </div>
  );
}

function TurnStart({ view }: { view: PlayerView }) {
  const { sendAction } = useSocket();
  const [mode, setMode] = useState<'menu' | 'trade'>('menu');
  const canAuction = view.deckCount > 0;
  const canTrade = tradeTargetsFor(view).length > 0;
  const canPass = view.deckCount === 0 && !canTrade;

  if (mode === 'trade') return <TradeInitiator view={view} onCancel={() => setMode('menu')} />;

  return (
    <div className="space-y-2">
      <p className="text-center text-sm text-parchment/70">À toi de jouer !</p>
      <Button onClick={() => sendAction({ type: 'CHOOSE_AUCTION' })} disabled={!canAuction} className="w-full">
        🔨 Lancer une enchère{!canAuction && ' (pioche vide)'}
      </Button>
      <Button variant="secondary" onClick={() => setMode('trade')} disabled={!canTrade} className="w-full">
        🤝 Proposer un marchandage{!canTrade && ' (impossible)'}
      </Button>
      {canPass && (
        <Button variant="ghost" onClick={() => sendAction({ type: 'PASS_TURN' })} className="w-full">
          Passer le tour
        </Button>
      )}
    </div>
  );
}

function ActionArea({ view }: { view: PlayerView }) {
  const { sendAction } = useSocket();
  const you = view.you;
  const leader = view.players[view.leaderIndex];
  const amLeader = leader?.id === you.id;

  switch (view.phase) {
    case 'turn_start':
      return amLeader ? (
        <TurnStart view={view} />
      ) : (
        <p className="text-center text-parchment/70">En attente du meneur ({leader?.name})…</p>
      );

    case 'auction': {
      const a = view.auction!;
      return (
        <div className="space-y-3">
          <div className="text-center text-sm text-parchment/70">
            Meilleure mise : <b className="text-brass-500">{a.highestBid || '—'}</b>
            {a.highestBidderId && <> par {nameOf(view, a.highestBidderId)}</>}
          </div>
          {amLeader ? (
            <p className="text-center text-parchment/70">Tu mènes — le dernier enchérisseur l'emporte à la fin du chrono.</p>
          ) : (
            <BidControls view={view} />
          )}
        </div>
      );
    }

    case 'auction_decision': {
      const a = view.auction!;
      if (!amLeader)
        return (
          <p className="text-center text-parchment/70">
            {leader?.name} décide d'exercer ou non son droit de préemption…
          </p>
        );
      const canPreempt = moneyValue(you.money) >= a.highestBid;
      return (
        <div className="space-y-2">
          <p className="text-center text-sm">
            {nameOf(view, a.highestBidderId)} l'emporte avec <b>{a.highestBid}</b> pour {ANIMAL_BY_ID[a.animal].name}.
          </p>
          <Button onClick={() => sendAction({ type: 'AUCTION_DECISION', preempt: false })} className="w-full">
            Encaisser {a.highestBid} et lui laisser
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendAction({ type: 'AUCTION_DECISION', preempt: true })}
            disabled={!canPreempt}
            className="w-full"
          >
            Préempter — payer {a.highestBid} et le garder
          </Button>
        </div>
      );
    }

    case 'auction_payment': {
      const pp = view.pendingPayment!;
      if (pp.payerId !== you.id)
        return <p className="text-center text-parchment/70">{nameOf(view, pp.payerId)} règle son achat…</p>;
      return (
        <div className="space-y-2">
          <p className="text-center text-sm">
            Paie au moins <b>{pp.amount}</b> à {nameOf(view, pp.recipientId)} (pas de monnaie rendue).
          </p>
          <MoneyPicker
            hand={you.money}
            min={pp.amount}
            confirmLabel="Payer"
            onConfirm={(payment) => sendAction({ type: 'PAY', payment })}
          />
        </div>
      );
    }

    case 'trade_offer': {
      const t = view.trade!;
      const a = ANIMAL_BY_ID[t.animal];
      if (t.targetId === you.id)
        return (
          <div className="space-y-3">
            <p className="text-center text-sm">
              {nameOf(view, t.initiatorId)} veut t'acheter <b>{a.name}</b>
              {t.count > 1 && ` (×${t.count})`}.
            </p>
            <div className="flex flex-col items-center gap-2">
              <AnimalCard id={t.animal} size="md" count={t.count} />
              <p className="text-sm text-parchment/70">
                Il·elle a posé{' '}
                <b className="text-brass-500">
                  {t.initiatorOfferCount} carte{t.initiatorOfferCount !== 1 ? 's' : ''}
                </b>{' '}
                face cachée.
              </p>
            </div>
            <TradeResponse view={view} />
          </div>
        );
      return (
        <p className="text-center text-parchment/70">
          {nameOf(view, t.initiatorId)} marchande avec {nameOf(view, t.targetId)} pour {a.name}…
        </p>
      );
    }

    case 'trade_reoffer': {
      const t = view.trade!;
      if (t.initiatorId === you.id)
        return (
          <div className="space-y-2">
            <p className="text-center text-sm">Égalité ! Refais une offre pour {ANIMAL_BY_ID[t.animal].name}.</p>
            <MoneyPicker
              hand={you.money}
              allowEmpty
              confirmLabel="Nouvelle offre"
              onConfirm={(offer) => sendAction({ type: 'TRADE_REOFFER', offer })}
            />
          </div>
        );
      return (
        <p className="text-center text-parchment/70">
          Égalité ! {nameOf(view, t.initiatorId)} doit refaire une offre…
        </p>
      );
    }

    default:
      return null;
  }
}

function TradeResponse({ view }: { view: PlayerView }) {
  const { sendAction } = useSocket();
  const [counter, setCounter] = useState(false);
  if (counter)
    return (
      <MoneyPicker
        hand={view.you.money}
        allowEmpty
        confirmLabel="Contrer"
        onConfirm={(offer) => sendAction({ type: 'TRADE_COUNTER', offer })}
        onCancel={() => setCounter(false)}
      />
    );
  return (
    <div className="flex gap-2">
      <Button onClick={() => sendAction({ type: 'TRADE_ACCEPT' })} className="flex-1">
        Accepter (céder)
      </Button>
      <Button variant="secondary" onClick={() => setCounter(true)} className="flex-1">
        Contre-offre
      </Button>
    </div>
  );
}

/* ------------------------------- Fin de partie ------------------------------ */

function Results({ view }: { view: PlayerView }) {
  const { leaveRoom } = useSocket();
  const navigate = useNavigate();
  const ranking = view.players
    .map((p) => ({ p, score: familiesScore(p.animals) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="text-5xl kh-bob">🏆</div>
        <h2 className="mb-4 font-display text-2xl font-bold text-brass-500">Partie terminée !</h2>
        <ol className="mb-5 space-y-1.5 text-left">
          {ranking.map(({ p, score }, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                view.winnerIds?.includes(p.id) ? 'bg-brass-500/25 ring-1 ring-brass-500' : 'bg-felt-800/60'
              }`}
            >
              <span className="shrink-0">
                {i + 1}. {p.name} {p.id === view.you.id && '(toi)'}
              </span>
              <span className="flex flex-1 justify-end gap-1 overflow-hidden">
                {ANIMALS.filter((a) => p.animals[a.id] === 4).map((a) => (
                  <AnimalCard key={a.id} id={a.id} size="sm" />
                ))}
              </span>
              <b className="shrink-0">{score} pts</b>
            </li>
          ))}
        </ol>
        <Button
          onClick={() => {
            leaveRoom();
            navigate('/');
          }}
          className="w-full"
        >
          Retour à l'accueil
        </Button>
      </Card>
    </div>
  );
}

/* --------------------------- Sons réactifs (diff) --------------------------- */

function useGameSounds(view: PlayerView | null): void {
  const prev = useRef<PlayerView | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (view && p) {
      const newCard =
        view.phase === 'auction' &&
        view.auction &&
        (p.phase !== 'auction' || p.auction?.animal !== view.auction.animal);
      if (newCard && view.auction) {
        sound.flip();
        sound.playAnimal(view.auction.animal);
      }
      if (
        view.phase === 'auction' &&
        p.phase === 'auction' &&
        view.auction &&
        p.auction &&
        view.auction.highestBid > p.auction.highestBid
      ) {
        sound.bid();
      }
      if (p.phase === 'auction' && view.phase === 'auction_decision') sound.sold();
      if (moneyValue(view.you.money) > moneyValue(p.you.money)) sound.coin();
      // Son sur résultat de marchandage
      const ev = view.lastEvent;
      if (ev && ev.seq !== p.lastEvent?.seq && ev.kind === 'trade') {
        const isParticipant = ev.initiatorId === view.you.id || ev.targetId === view.you.id;
        if (isParticipant) {
          if (ev.winnerId === view.you.id) sound.fanfare();
          else sound.womp();
        }
      }
      if (view.phase === 'finished' && p.phase !== 'finished') {
        if (view.winnerIds?.includes(view.you.id)) sound.fanfare();
        else sound.womp();
      }
    }
    prev.current = view;
  }, [view]);
}

/* --------------------------------- Plateau --------------------------------- */

export function GameBoard() {
  const { gameView: view, leaveRoom } = useSocket();
  const navigate = useNavigate();
  const [muted, setMutedState] = useState(sound.isMuted());
  useGameSounds(view);

  if (!view) return null;

  const you = view.you;
  const leader = view.players[view.leaderIndex];
  const isAuction = view.phase === 'auction' || view.phase === 'auction_decision';

  const toggleMute = () => {
    const next = !muted;
    sound.setMuted(next);
    setMutedState(next);
    if (!next) sound.unlockAudio();
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4">
      <EventBanner view={view} />
      {/* Barre d'état */}
      <header className="mb-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3 text-parchment/70">
          <span className="flex items-center gap-1.5">
            <CardBack size="sm" count={view.deckCount} />
            <span className="hidden sm:inline">pioche</span>
          </span>
          <span>🫏 {view.donkeysDrawn}/4</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleMute} className="text-lg" title={muted ? 'Activer le son' : 'Couper le son'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={() => {
              leaveRoom();
              navigate('/');
            }}
            className="text-parchment/50 hover:underline"
          >
            Quitter
          </button>
        </div>
      </header>

      {/* Adversaires */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {view.players
          .filter((p) => p.id !== you.id)
          .map((p) => (
            <Card key={p.id} className={`p-3 ${leader?.id === p.id ? 'ring-2 ring-brass-500' : ''}`}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-green-400' : 'bg-stone-500'}`} />
                <span className="font-medium">{p.name}</span>
                {leader?.id === p.id && <span className="text-xs text-brass-500">meneur</span>}
                <span className="ml-auto rounded bg-felt-800/80 px-1.5 py-0.5 text-xs text-parchment/70">
                  💰 {p.moneyCardCount}
                </span>
              </div>
              <AnimalsHand animals={p.animals} size="sm" />
            </Card>
          ))}
      </div>

      {/* Zone d'action centrale */}
      <Card className="mb-3 p-4">
        {isAuction && view.auction && <AuctionStage view={view} />}
        <ActionArea view={view} />
      </Card>

      {/* Toi */}
      <Card className={`p-3 ${leader?.id === you.id ? 'ring-2 ring-brass-500' : ''}`}>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-semibold text-brass-500">{you.name} (toi)</span>
          {leader?.id === you.id && <span className="text-xs text-brass-500">meneur</span>}
        </div>
        <div className="mb-2">
          <AnimalsHand animals={you.animals} />
        </div>
        <MoneyHand money={you.money} />
      </Card>

      {/* Journal */}
      {view.log.length > 0 && (
        <details className="mt-3 text-sm text-parchment/60">
          <summary className="cursor-pointer select-none">Journal</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-felt-900/50 p-2">
            {view.log.slice(-12).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      {view.phase === 'finished' && <Results view={view} />}
    </div>
  );
}
