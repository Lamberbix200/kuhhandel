import { useState } from 'react';
import type { Denomination, Money } from '@kuhhandel/shared';
import { DENOMINATIONS, emptyMoney, moneyCardCount, moneyValue } from '@kuhhandel/shared';
import { Button } from '../ui';

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
      <div className="space-y-1.5">
        {denoms.map((d) => (
          <div key={d} className="flex items-center gap-3 rounded-lg bg-felt-800/60 px-3 py-1.5">
            <span className="w-14 font-mono text-brass-500">{d === 0 ? 'Bluff' : d}</span>
            <span className="flex-1 text-xs text-parchment/50">dispo {hand[d]}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setD(d, sel[d] - 1)}
                disabled={sel[d] <= 0}
                className="h-8 w-8 rounded-lg bg-felt-700 text-lg disabled:opacity-40"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold">{sel[d]}</span>
              <button
                onClick={() => setD(d, sel[d] + 1)}
                disabled={sel[d] >= hand[d]}
                className="h-8 w-8 rounded-lg bg-felt-700 text-lg disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
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
          <Button
            onClick={() => onConfirm(sel)}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
