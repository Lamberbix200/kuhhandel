import { useEffect, useRef, useState } from 'react';
import type { GameEvent, PlayerView } from '@kuhhandel/shared';
import { ANIMAL_BY_ID } from '@kuhhandel/shared';

interface Banner {
  headline: string;
  sub?: string;
  /** true = victoire, false = défaite, null = neutre */
  outcome: boolean | null;
}

function buildBanner(ev: GameEvent & { seq: number }, view: PlayerView): Banner {
  const myId = view.you.id;

  const name = (id: string | null): string => {
    if (!id) return '—';
    if (id === myId) return 'toi';
    return view.players.find((p) => p.id === id)?.name ?? '—';
  };

  const animal = ANIMAL_BY_ID[ev.animal];

  if (ev.kind === 'auction') {
    const won = ev.winnerId === myId;
    if (ev.free) {
      return {
        headline: won ? `Tu récupères ${animal.name} gratuitement !` : `${name(ev.winnerId)} récupère ${animal.name} sans frais`,
        outcome: won ? true : null,
      };
    }
    if (won) {
      return {
        headline: `Tu remportes ${animal.name} !`,
        sub: `pour ${ev.price} (${ev.preempt ? 'préemption' : 'enchère'})`,
        outcome: true,
      };
    }
    return {
      headline: `${name(ev.winnerId)} remporte ${animal.name}`,
      sub: `pour ${ev.price}`,
      outcome: false,
    };
  }

  // trade
  const isInitiator = ev.initiatorId === myId;
  const isTarget = ev.targetId === myId;
  const won = ev.winnerId === myId;

  if (!isInitiator && !isTarget) {
    const loserId = ev.winnerId === ev.initiatorId ? ev.targetId : ev.initiatorId;
    return {
      headline: `${name(ev.winnerId)} remporte ${animal.name}×${ev.count} au marchandage`,
      sub: `contre ${name(loserId)}${ev.free ? ' (cession gratuite)' : ''}`,
      outcome: null,
    };
  }

  if (ev.free) {
    return {
      headline: won
        ? `Tu récupères ${animal.name}×${ev.count} gratuitement !`
        : `${name(ev.winnerId)} prend ${animal.name}×${ev.count} sans échange`,
      outcome: won ? true : false,
    };
  }

  const myValue = isInitiator ? ev.initiatorValue : ev.targetValue;
  const otherValue = isInitiator ? ev.targetValue : ev.initiatorValue;
  const otherId = isInitiator ? ev.targetId : ev.initiatorId;
  const myVerb = isInitiator ? 'tu as proposé' : 'tu as donné';
  const otherVerb = isInitiator ? 'a donné' : 'a proposé';

  if (won) {
    return {
      headline: `Gagné ! Tu remportes ${animal.name}×${ev.count}`,
      sub: `${myVerb} ${myValue ?? '?'}, ${name(otherId)} ${otherVerb} ${otherValue ?? '?'}`,
      outcome: true,
    };
  }
  return {
    headline: `Perdu ! ${name(ev.winnerId)} prend ${animal.name}×${ev.count}`,
    sub: `${myVerb} ${myValue ?? '?'}, ${name(otherId)} ${otherVerb} ${otherValue ?? '?'}`,
    outcome: false,
  };
}

const DISMISS_MS = 4500;

export function EventBanner({ view }: { view: PlayerView }) {
  const seenSeq = useRef<number | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [key, setKey] = useState(0);

  const ev = view.lastEvent;

  useEffect(() => {
    if (!ev || ev.seq === seenSeq.current) return;
    seenSeq.current = ev.seq;
    setBanner(buildBanner(ev, view));
    setKey((k) => k + 1);
    const t = setTimeout(() => setBanner(null), DISMISS_MS);
    return () => clearTimeout(t);
  }, [ev, view]);

  if (!banner) return null;

  const bg =
    banner.outcome === true
      ? 'bg-brass-500 text-felt-900'
      : banner.outcome === false
        ? 'bg-red-700 text-parchment'
        : 'bg-felt-700 text-parchment';

  return (
    <div
      key={key}
      onClick={() => setBanner(null)}
      className={`kh-result fixed inset-x-4 top-4 z-50 cursor-pointer rounded-xl px-5 py-3 text-center shadow-2xl ${bg}`}
    >
      <p className="font-display text-lg font-bold leading-snug">{banner.headline}</p>
      {banner.sub && <p className="mt-0.5 text-sm opacity-80">{banner.sub}</p>}
      <p className="mt-1 text-xs opacity-50">Appuie pour fermer</p>
    </div>
  );
}
