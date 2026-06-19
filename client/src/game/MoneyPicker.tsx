import { useState } from 'react';
import type { Denomination, Money } from '@kuhhandel/shared';
import { DENOMINATIONS, emptyMoney, moneyCardCount, moneyValue } from '@kuhhandel/shared';
import { Button } from '../ui';
import { MoneyCard } from './cards';

interface Props {
  /** Liasse disponible (ta main). */
  hand: Money;
  /** Montant minimum requis (paiement). Absent = libre. */
  min?: number;
  /** Autorise une offre vide (bluff lors d'un marchandage). */
  allowEmpty?: boolean;
  confirmLabel: string;
  onConfirm: (offer: Money) => void;
  onCancel?: () => void;
  /** Masque la valeur totale (pour insister sur le bluff). Défaut: visible. */
  hideValue?: boolean;
}

export function MoneyPicker({
  hand,
  min,
  allowEmpty = false,
  confirmLabel,
  onConfirm,
  onCancel,
  hideValue = false,
}: Props) {
  const [sel, setSel] = useState<Money>(emptyMoney());
  const total = moneyValue(sel);
  const cards = moneyCardCount(sel);
  const denoms = DENOMINATIONS.filter((d) => hand[d] > 0);

  const setD = (d: Denomination, v: number) =>
    setSel((s) => ({ ...s, [d]: Math.max(0, Math.min(hand[d], v)) }));

  const meetsMin = min === undefined || total >= min;
  const canConfirm = meetsMin && (allowEmpty || total > 0);

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-parchment/50">Touche un sac pour l'ajouter à ton offre.</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {denoms.map((d) => {
          const picked = sel[d];
          return (
            <div key={d} className="flex flex-col items-center gap-1">
              <button
                onClick={() => setD(d, picked + 1)}
                disabled={picked >= hand[d]}
                className={`rounded-lg transition-transform active:scale-95 disabled:opacity-50 ${
                  picked > 0 ? 'ring-2 ring-brass-500 ring-offset-2 ring-offset-felt-900' : ''
                }`}
                aria-label={`Ajouter ${d === 0 ? 'une carte bluff' : d}`}
              >
                <MoneyCard denom={d} size="md" count={hand[d]} />
              </button>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setD(d, picked - 1)}
                  disabled={picked <= 0}
                  className="flex h-6 w-6 items-center justify-center rounded bg-felt-700 text-base disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-9 text-center tabular-nums">
                  <b className="text-parchment">{picked}</b>
                  <span className="text-parchment/40">/{hand[d]}</span>
                </span>
                <button
                  onClick={() => setD(d, picked + 1)}
                  disabled={picked >= hand[d]}
                  className="flex h-6 w-6 items-center justify-center rounded bg-felt-700 text-base disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-parchment/10 pt-2 text-sm">
        <span className="text-parchment/60">
          {cards} carte{cards > 1 ? 's' : ''}
          {!hideValue && (
            <>
              {' · '}
              <b className={meetsMin ? 'text-parchment' : 'text-red-400'}>{total}</b>
              {min !== undefined && <span className="text-parchment/50"> / {min} min</span>}
            </>
          )}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} className="px-3 py-1.5 text-sm">
              Annuler
            </Button>
          )}
          <Button onClick={() => onConfirm(sel)} disabled={!canConfirm} className="px-3 py-1.5 text-sm">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
