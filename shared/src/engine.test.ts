import { describe, it, expect } from 'vitest';
import { applyAction, createGame, viewFor, GameError, type GameState } from './engine';
import { moneyValue, MONEY_SUPPLY, scorePlayer } from './constants';
import type { AnimalId, Money } from './types';

function m(partial: Partial<Money>): Money {
  return { 0: 0, 10: 0, 50: 0, 100: 0, 200: 0, 500: 0, ...partial };
}

/** Partie démarrée à 3 joueurs (p0, p1, p2), meneur = p0, deck/argent contrôlables. */
function started(): GameState {
  const g = createGame([
    { id: 'p0', name: 'Alice' },
    { id: 'p1', name: 'Bob' },
    { id: 'p2', name: 'Carol' },
  ]);
  const s = applyAction(g, 'p0', { type: 'START', seed: 1 });
  s.leaderIndex = 0;
  return s;
}

describe('createGame', () => {
  it('refuse moins de 3 joueurs', () => {
    expect(() => createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])).toThrow(GameError);
  });
  it('refuse plus de 5 joueurs', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => createGame(six)).toThrow(GameError);
  });
  it('donne 90 d\'avoir de départ et aucun animal', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
    for (const p of g.players) {
      expect(moneyValue(p.money)).toBe(90);
      expect(Object.values(p.animals).every((n) => n === 0)).toBe(true);
    }
  });
});

describe('START', () => {
  it('mélange 40 cartes et passe en turn_start', () => {
    const s = started();
    expect(s.deck).toHaveLength(40);
    expect(s.phase).toBe('turn_start');
  });
  it('la réserve = stock total moins l\'avoir distribué', () => {
    const s = started();
    expect(moneyValue(s.bank)).toBe(moneyValue(MONEY_SUPPLY) - 3 * 90);
  });
  it('est déterministe pour une même graine', () => {
    const a = applyAction(createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }, { id: 'p2', name: 'C' }]), 'p0', { type: 'START', seed: 7 });
    const b = applyAction(createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }, { id: 'p2', name: 'C' }]), 'p0', { type: 'START', seed: 7 });
    expect(a.deck).toEqual(b.deck);
    expect(a.leaderIndex).toBe(b.leaderIndex);
  });
});

describe('enchère', () => {
  it('déroulé standard : mise, passe, adjudication, paiement', () => {
    let s = started();
    s.deck = ['cow'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    expect(s.phase).toBe('auction');
    expect(s.auction?.animal).toBe('cow');

    s = applyAction(s, 'p1', { type: 'BID', amount: 30 });
    s = applyAction(s, 'p2', { type: 'PASS' });
    expect(s.phase).toBe('auction_decision');

    s = applyAction(s, 'p0', { type: 'AUCTION_DECISION', preempt: false });
    expect(s.phase).toBe('auction_payment');
    expect(s.pendingPayment?.payerId).toBe('p1');

    s = applyAction(s, 'p1', { type: 'PAY', payment: m({ 10: 3 }) });
    const p1 = s.players.find((p) => p.id === 'p1')!;
    const p0 = s.players.find((p) => p.id === 'p0')!;
    expect(p1.animals.cow).toBe(1);
    expect(moneyValue(p1.money)).toBe(60); // 90 - 30
    expect(moneyValue(p0.money)).toBe(120); // 90 + 30
    expect(s.phase).toBe('turn_start');
  });

  it('le meneur ne peut pas miser', () => {
    let s = started();
    s.deck = ['pig'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    expect(() => applyAction(s, 'p0', { type: 'BID', amount: 10 })).toThrow(GameError);
  });

  it('refuse une mise non multiple de 10 ou inférieure', () => {
    let s = started();
    s.deck = ['pig'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    expect(() => applyAction(s, 'p1', { type: 'BID', amount: 15 })).toThrow(GameError);
    s = applyAction(s, 'p1', { type: 'BID', amount: 20 });
    expect(() => applyAction(s, 'p2', { type: 'BID', amount: 20 })).toThrow(GameError);
  });

  it('refuse un paiement insuffisant (pas de monnaie rendue)', () => {
    let s = started();
    s.deck = ['horse'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    s = applyAction(s, 'p1', { type: 'BID', amount: 30 });
    s = applyAction(s, 'p2', { type: 'PASS' });
    s = applyAction(s, 'p0', { type: 'AUCTION_DECISION', preempt: false });
    expect(() => applyAction(s, 'p1', { type: 'PAY', payment: m({ 10: 2 }) })).toThrow(GameError);
  });

  it('sans aucune mise, le meneur emporte la carte gratuitement', () => {
    let s = started();
    s.deck = ['goat'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    s = applyAction(s, 'p1', { type: 'PASS' });
    s = applyAction(s, 'p2', { type: 'PASS' });
    const p0 = s.players.find((p) => p.id === 'p0')!;
    expect(p0.animals.goat).toBe(1);
    expect(moneyValue(p0.money)).toBe(90); // rien dépensé
    expect(s.phase).toBe('turn_start');
  });

  it('préemption : le meneur achète et paie le meilleur enchérisseur', () => {
    let s = started();
    s.deck = ['cow'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    s = applyAction(s, 'p1', { type: 'BID', amount: 50 });
    s = applyAction(s, 'p2', { type: 'PASS' });
    s = applyAction(s, 'p0', { type: 'AUCTION_DECISION', preempt: true });
    expect(s.pendingPayment?.payerId).toBe('p0');
    expect(s.pendingPayment?.cardToId).toBe('p0');
    s = applyAction(s, 'p0', { type: 'PAY', payment: m({ 50: 1 }) });
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(1);
    expect(moneyValue(p0.money)).toBe(40); // 90 - 50
    expect(moneyValue(p1.money)).toBe(140); // 90 + 50
  });

  it('une relance rouvre la parole à ceux qui avaient passé (4 joueurs)', () => {
    const g = createGame([
      { id: 'p0', name: 'A' },
      { id: 'p1', name: 'B' },
      { id: 'p2', name: 'C' },
      { id: 'p3', name: 'D' },
    ]);
    let s = applyAction(g, 'p0', { type: 'START', seed: 1 });
    s.leaderIndex = 0;
    s.deck = ['dog'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    s = applyAction(s, 'p1', { type: 'BID', amount: 10 });
    s = applyAction(s, 'p2', { type: 'PASS' }); // passé, mais p3 n'a pas encore parlé
    expect(s.phase).toBe('auction');
    s = applyAction(s, 'p3', { type: 'BID', amount: 20 }); // relance -> rouvre la parole
    expect(s.phase).toBe('auction');
    expect(s.auction?.highestBidderId).toBe('p3');
    expect(s.auction?.passed).toHaveLength(0); // p2 peut de nouveau enchérir
    // p1 et p2 passent : p3 reste seul en tête -> adjudication
    s = applyAction(s, 'p1', { type: 'PASS' });
    s = applyAction(s, 'p2', { type: 'PASS' });
    expect(s.phase).toBe('auction_decision');
  });
});

describe('âne', () => {
  it('1er âne : chaque joueur reçoit une carte de 50', () => {
    let s = started();
    s.deck = ['donkey'];
    const bank50 = s.bank[50];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    expect(s.donkeysDrawn).toBe(1);
    for (const p of s.players) expect(p.money[50]).toBeGreaterThanOrEqual(1);
    expect(s.bank[50]).toBe(bank50 - 3);
    expect(s.auction?.animal).toBe('donkey'); // puis mis aux enchères
  });

  it('paie 50 puis 100 selon le rang de l\'âne', () => {
    let s = started();
    s.deck = ['donkey'];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    const after1 = s.players.find((p) => p.id === 'p0')!.money[50];
    // simulate second donkey
    s.deck = ['donkey'];
    s.phase = 'turn_start';
    s.auction = null;
    const bank100 = s.bank[100];
    s = applyAction(s, 'p0', { type: 'CHOOSE_AUCTION' });
    expect(s.donkeysDrawn).toBe(2);
    expect(s.bank[100]).toBe(bank100 - 3);
    expect(after1).toBeGreaterThanOrEqual(1);
  });
});

describe('marchandage', () => {
  function withCows(counts: [number, number, number]): GameState {
    const s = started();
    s.players[0]!.animals.cow = counts[0];
    s.players[1]!.animals.cow = counts[1];
    s.players[2]!.animals.cow = counts[2];
    return s;
  }

  it('acceptation : la cible cède l\'animal et garde l\'argent', () => {
    let s = withCows([1, 1, 0]);
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 10: 2 }) });
    expect(s.phase).toBe('trade_offer');
    s = applyAction(s, 'p1', { type: 'TRADE_ACCEPT' });
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(2);
    expect(p1.animals.cow).toBe(0);
    expect(moneyValue(p1.money)).toBe(110); // 90 + 20
    expect(moneyValue(p0.money)).toBe(70); // 90 - 20
  });

  it('contre-offre : le plus offrant (initiateur) gagne, mises échangées', () => {
    let s = withCows([1, 1, 0]);
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 50: 1 }) }); // 50
    s = applyAction(s, 'p1', { type: 'TRADE_COUNTER', offer: m({ 10: 3 }) }); // 30
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(2); // initiateur gagne
    expect(p1.animals.cow).toBe(0);
    // p0 récupère l'offre de p1 (30) ; p1 récupère l'offre de p0 (50)
    expect(moneyValue(p0.money)).toBe(90 - 50 + 30);
    expect(moneyValue(p1.money)).toBe(90 - 30 + 50);
  });

  it('contre-offre : le plus offrant (cible) conserve l\'animal', () => {
    let s = withCows([1, 1, 0]);
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 10: 3 }) }); // 30
    s = applyAction(s, 'p1', { type: 'TRADE_COUNTER', offer: m({ 50: 1 }) }); // 50
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(0); // initiateur cède
    expect(p1.animals.cow).toBe(2);
  });

  it('égalité puis nouvelle offre ; seconde égalité = cession gratuite', () => {
    let s = withCows([1, 1, 0]);
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 10: 3 }) }); // 30
    s = applyAction(s, 'p1', { type: 'TRADE_COUNTER', offer: m({ 10: 3 }) }); // 30 -> égalité
    expect(s.phase).toBe('trade_reoffer');
    expect(s.trade?.isReoffer).toBe(true);
    s = applyAction(s, 'p0', { type: 'TRADE_REOFFER', offer: m({ 50: 1 }) }); // 50
    expect(s.phase).toBe('trade_offer');
    s = applyAction(s, 'p1', { type: 'TRADE_COUNTER', offer: m({ 50: 1 }) }); // 50 -> double égalité
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(2); // cession gratuite à l'initiateur
    expect(p1.animals.cow).toBe(0);
    expect(moneyValue(p0.money)).toBe(90); // mises rendues, rien de payé
    expect(moneyValue(p1.money)).toBe(90);
  });

  it('marchandage spécial : 2 contre 2, le gagnant complète la famille', () => {
    let s = withCows([2, 2, 0]);
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 50: 1 }) });
    expect(s.trade?.count).toBe(2);
    s = applyAction(s, 'p1', { type: 'TRADE_ACCEPT' });
    const p0 = s.players.find((p) => p.id === 'p0')!;
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p0.animals.cow).toBe(4); // famille complète
    expect(p1.animals.cow).toBe(0);
  });

  it('refuse un marchandage si l\'un des deux ne possède pas l\'animal', () => {
    const s = withCows([1, 0, 0]);
    expect(() => applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({}) })).toThrow(GameError);
  });
});

describe('fin de partie et score', () => {
  it('quand toutes les familles sont complètes, désigne le gagnant', () => {
    const s = started();
    s.deck = [];
    const fams: AnimalId[][] = [
      ['rooster', 'goose', 'cat', 'dog'],
      ['sheep', 'goat', 'donkey'],
      ['pig', 'cow', 'horse'],
    ];
    fams.forEach((list, i) => list.forEach((a) => (s.players[i]!.animals[a] = 4)));
    s.phase = 'turn_start';
    const out = applyAction(s, 'p0', { type: 'PASS_TURN' });
    expect(out.phase).toBe('finished');
    // p2 : (650+800+1000)*3 = 7350, le plus élevé
    expect(out.winnerIds).toEqual(['p2']);
    expect(scorePlayer(out.players[2]!)).toBe(7350);
  });

  it('PASS_TURN est interdit tant qu\'il reste des cartes', () => {
    const s = started();
    s.deck = ['cow'];
    expect(() => applyAction(s, 'p0', { type: 'PASS_TURN' })).toThrow(GameError);
  });
});

describe('viewFor', () => {
  it('masque l\'argent des adversaires mais montre le tien', () => {
    const s = started();
    const view = viewFor(s, 'p0');
    expect(moneyValue(view.you.money)).toBe(90);
    const others = view.players.filter((p) => p.id !== 'p0');
    for (const o of others) {
      expect(o).not.toHaveProperty('money');
      expect(o.moneyCardCount).toBe(7); // 2+4+1 cartes, sans en révéler la valeur
    }
  });

  it('masque les offres scellées du marchandage', () => {
    let s = started();
    s.players[0]!.animals.cow = 1;
    s.players[1]!.animals.cow = 1;
    s = applyAction(s, 'p0', { type: 'CHOOSE_TRADE', targetId: 'p1', animal: 'cow', offer: m({ 50: 1 }) });
    const view = viewFor(s, 'p1');
    expect(view.trade?.hasInitiatorOffer).toBe(true);
    expect(view.trade).not.toHaveProperty('initiatorOffer');
  });
});
