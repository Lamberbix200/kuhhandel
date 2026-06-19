import type { CSSProperties } from 'react';
import type { AnimalId, Denomination } from '@kuhhandel/shared';
import { ANIMAL_BY_ID } from '@kuhhandel/shared';

/**
 * Composants « cartes » du jeu : carte animal et carte d'argent (sac de pièces
 * dessiné en SVG), plus le dos de pioche. Les couleurs distinguent chaque famille
 * d'animaux et chaque valeur d'argent, comme sur le jeu d'origine.
 */

export type CardSize = 'sm' | 'md' | 'lg';

interface SizeConf {
  w: string;
  round: string;
  emoji: string;
  val: string;
  name: string;
}

const SIZE: Record<CardSize, SizeConf> = {
  sm: { w: 'w-11', round: 'rounded-md', emoji: 'text-2xl', val: 'text-[9px]', name: 'text-[7px]' },
  md: { w: 'w-20', round: 'rounded-lg', emoji: 'text-4xl', val: 'text-xs', name: 'text-[10px]' },
  lg: { w: 'w-36', round: 'rounded-2xl', emoji: 'text-7xl', val: 'text-xl', name: 'text-sm' },
};

const ANIMAL_COLORS: Record<AnimalId, { accent: string; soft: string }> = {
  rooster: { accent: '#d9554d', soft: '#f7dcd9' },
  goose: { accent: '#5fa8d3', soft: '#dbecf7' },
  cat: { accent: '#e0a23b', soft: '#f6e8cb' },
  dog: { accent: '#b5793f', soft: '#efddc8' },
  sheep: { accent: '#8a97a3', soft: '#e5eaee' },
  goat: { accent: '#9c8e7a', soft: '#eae3d8' },
  donkey: { accent: '#7c6fb0', soft: '#e3ddf2' },
  pig: { accent: '#e07ba0', soft: '#f8dfe9' },
  cow: { accent: '#4f9e85', soft: '#d6ece5' },
  horse: { accent: '#9a5a39', soft: '#eddacd' },
};

/** Couleurs des cartes d'argent par valeur (0 = carte de bluff). */
export const DENOM_COLORS: Record<Denomination, { accent: string; soft: string; label: string }> = {
  0: { accent: '#6b7280', soft: '#e5e7eb', label: 'BLUFF' },
  10: { accent: '#b87333', soft: '#efdcc6', label: '10' },
  50: { accent: '#2f9e5a', soft: '#d3eddd', label: '50' },
  100: { accent: '#3b76c4', soft: '#d6e3f5', label: '100' },
  200: { accent: '#8b5cb8', soft: '#e6daf2', label: '200' },
  500: { accent: '#c1453b', soft: '#f4d6d3', label: '500' },
};

function CountBadge({ n }: { n: number }) {
  if (n <= 1) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-felt-900 px-1 text-[10px] font-bold text-parchment ring-2 ring-parchment">
      ×{n}
    </span>
  );
}

/** Carte animal : illustration (emoji XL), valeur de la famille, nom, bande de couleur. */
export function AnimalCard({
  id,
  size = 'md',
  count = 1,
  className = '',
  faded = false,
}: {
  id: AnimalId;
  size?: CardSize;
  count?: number;
  className?: string;
  faded?: boolean;
}) {
  const a = ANIMAL_BY_ID[id];
  const c = ANIMAL_COLORS[id];
  const s = SIZE[size];
  return (
    <div className={`relative ${s.w} shrink-0 ${className}`}>
      <CountBadge n={count} />
      <div
        className={`relative aspect-[5/7] ${s.round} overflow-hidden bg-parchment shadow-md ring-1 ring-black/15 ${
          faded ? 'opacity-50 grayscale' : ''
        }`}
      >
        {/* valeur en coin */}
        <div className={`absolute left-1 top-0.5 z-10 font-display font-bold leading-none ${s.val}`} style={{ color: c.accent }}>
          {a.value}
        </div>
        {/* halo + illustration */}
        <div className="absolute inset-0 flex items-center justify-center pb-2">
          <div
            className="flex aspect-square w-[78%] items-center justify-center rounded-full"
            style={{ background: c.soft }}
          >
            <span className={`${s.emoji} leading-none drop-shadow-sm`}>{a.emoji}</span>
          </div>
        </div>
        {/* bande nom */}
        <div
          className={`absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center font-semibold uppercase tracking-wide text-white ${s.name}`}
          style={{ background: c.accent }}
        >
          {a.name}
        </div>
      </div>
    </div>
  );
}

/** Sac d'argent dessiné (illustration des cartes d'argent). */
function MoneySack({ accent, style }: { accent: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" className="h-[64%] w-[64%]" style={style} aria-hidden>
      {/* corps du sac */}
      <path d="M14 30 C12 50 22 58 32 58 C42 58 52 50 50 30 C49 24 41 22 32 22 C23 22 15 24 14 30 Z" fill={accent} />
      {/* ombrage */}
      <path d="M32 22 C41 22 49 24 50 30 C52 50 42 58 32 58 Z" fill="#000" opacity="0.12" />
      {/* col plissé */}
      <path d="M22 22 L20 15 L26 18 L32 13 L38 18 L44 15 L42 22 C38 25 26 25 22 22 Z" fill={accent} />
      <path d="M22 22 C26 25 38 25 42 22" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* lien */}
      <rect x="21" y="21" width="22" height="3.4" rx="1.7" fill="#000" opacity="0.25" />
      {/* symbole pièce */}
      <circle cx="32" cy="42" r="8" fill="#fff" opacity="0.85" />
      <circle cx="32" cy="42" r="8" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  );
}

/** Carte d'argent : sac coloré + valeur (ou « BLUFF » pour la carte 0). */
export function MoneyCard({
  denom,
  size = 'md',
  count = 1,
  className = '',
}: {
  denom: Denomination;
  size?: CardSize;
  count?: number;
  className?: string;
}) {
  const c = DENOM_COLORS[denom];
  const s = SIZE[size];
  const isBluff = denom === 0;
  return (
    <div className={`relative ${s.w} shrink-0 ${className}`}>
      <CountBadge n={count} />
      <div className={`relative aspect-[5/7] ${s.round} overflow-hidden bg-parchment shadow-md ring-1 ring-black/15`}>
        <div className={`absolute left-1 top-0.5 z-10 font-display font-bold leading-none ${s.val}`} style={{ color: c.accent }}>
          {isBluff ? '0' : denom}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pb-3" style={{ background: c.soft }}>
          {isBluff ? <span className={`${s.emoji} leading-none`}>🤫</span> : <MoneySack accent={c.accent} />}
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center font-bold uppercase tracking-wide text-white ${s.name}`}
          style={{ background: c.accent }}
        >
          {c.label}
        </div>
      </div>
    </div>
  );
}

/** Dos de carte (pioche d'animaux). */
export function CardBack({ size = 'md', count, className = '' }: { size?: CardSize; count?: number; className?: string }) {
  const s = SIZE[size];
  return (
    <div className={`relative ${s.w} shrink-0 ${className}`}>
      <div
        className={`relative aspect-[5/7] ${s.round} overflow-hidden shadow-md ring-1 ring-black/30`}
        style={{ background: 'repeating-linear-gradient(45deg, #14502f, #14502f 6px, #0f3d24 6px, #0f3d24 12px)' }}
      >
        <div className="absolute inset-1.5 rounded-[inherit] ring-1 ring-brass-500/50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${s.emoji} leading-none opacity-90`}>🐮</span>
        </div>
      </div>
      {count !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-brass-500 px-1 text-[10px] font-bold text-felt-900 ring-2 ring-felt-900">
          {count}
        </span>
      )}
    </div>
  );
}
