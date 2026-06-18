import { describe, it, expect } from 'vitest';
import {
  ANIMALS,
  ANIMAL_BY_ID,
  MONEY_SUPPLY,
  STARTING_MONEY,
  DONKEY_PAYOUTS,
  buildAnimalDeck,
  moneyValue,
  moneyCardCount,
  startingMoney,
  shuffle,
  scorePlayer,
  emptyAnimals,
  emptyMoney,
  addMoney,
  subtractMoney,
  moneyContains,
} from './constants';
import type { AnimalId, PlayerState } from './types';

function makePlayer(animals: Partial<Record<AnimalId, number>>): PlayerState {
  return {
    id: 'p',
    name: 'p',
    money: emptyMoney(),
    animals: { ...emptyAnimals(), ...animals },
    connected: true,
  };
}

describe('familles d\'animaux', () => {
  it('compte 10 familles', () => {
    expect(ANIMALS).toHaveLength(10);
  });

  it('a les valeurs canoniques du jeu', () => {
    expect(ANIMAL_BY_ID.rooster.value).toBe(10);
    expect(ANIMAL_BY_ID.goose.value).toBe(40);
    expect(ANIMAL_BY_ID.cat.value).toBe(90);
    expect(ANIMAL_BY_ID.dog.value).toBe(160);
    expect(ANIMAL_BY_ID.sheep.value).toBe(250);
    expect(ANIMAL_BY_ID.goat.value).toBe(350);
    expect(ANIMAL_BY_ID.donkey.value).toBe(500);
    expect(ANIMAL_BY_ID.pig.value).toBe(650);
    expect(ANIMAL_BY_ID.cow.value).toBe(800);
    expect(ANIMAL_BY_ID.horse.value).toBe(1000);
  });

  it('a des ids uniques', () => {
    const ids = new Set(ANIMALS.map((a) => a.id));
    expect(ids.size).toBe(ANIMALS.length);
  });
});

describe('paquet d\'animaux', () => {
  it('contient 40 cartes', () => {
    expect(buildAnimalDeck()).toHaveLength(40);
  });

  it('contient 4 cartes de chaque famille', () => {
    const deck = buildAnimalDeck();
    for (const animal of ANIMALS) {
      expect(deck.filter((id) => id === animal.id)).toHaveLength(4);
    }
  });
});

describe('argent', () => {
  it('le paquet total fait 55 cartes', () => {
    expect(moneyCardCount(MONEY_SUPPLY)).toBe(55);
  });

  it('le paquet total vaut 4700', () => {
    expect(moneyValue(MONEY_SUPPLY)).toBe(4700);
  });

  it('l\'avoir de départ vaut 90 (2×0 + 4×10 + 1×50)', () => {
    expect(moneyValue(STARTING_MONEY)).toBe(90);
    expect(moneyCardCount(STARTING_MONEY)).toBe(7);
  });

  it('startingMoney() renvoie une nouvelle liasse indépendante', () => {
    const a = startingMoney();
    a[10] = 999;
    expect(STARTING_MONEY[10]).toBe(4);
  });

  it('add/subtract/contains sont cohérents', () => {
    const a = { 0: 0, 10: 3, 50: 1, 100: 0, 200: 0, 500: 0 };
    const b = { 0: 0, 10: 1, 50: 1, 100: 0, 200: 0, 500: 0 };
    expect(moneyContains(a, b)).toBe(true);
    expect(moneyContains(b, a)).toBe(false);
    const sum = addMoney(a, b);
    expect(moneyValue(sum)).toBe(moneyValue(a) + moneyValue(b));
    const diff = subtractMoney(a, b);
    expect(diff[10]).toBe(2);
    expect(diff[50]).toBe(0);
  });

  it('5 joueurs épuisent exactement les cartes 0 et 10 au départ', () => {
    // 5 × (2 cartes de 0) = 10 = stock de 0 ; 5 × (4 cartes de 10) = 20 = stock de 10
    expect(5 * STARTING_MONEY[0]).toBe(MONEY_SUPPLY[0]);
    expect(5 * STARTING_MONEY[10]).toBe(MONEY_SUPPLY[10]);
  });
});

describe('âne', () => {
  it('distribue 50, 100, 200, 500', () => {
    expect(DONKEY_PAYOUTS).toEqual([50, 100, 200, 500]);
  });
});

describe('shuffle', () => {
  it('conserve tous les éléments (permutation)', () => {
    const deck = buildAnimalDeck();
    let seed = 42;
    const rng = () => {
      // PRNG déterministe simple (mulberry32-like) pour le test
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffled = shuffle(deck, rng);
    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  it('ne mute pas le tableau d\'entrée', () => {
    const deck = buildAnimalDeck();
    const copy = [...deck];
    shuffle(deck, () => 0.5);
    expect(deck).toEqual(copy);
  });
});

describe('score', () => {
  it('exemple du livret : 4 cochons + 4 chiens + 4 coqs = 2460', () => {
    const player = makePlayer({ pig: 4, dog: 4, rooster: 4 });
    expect(scorePlayer(player)).toBe((650 + 160 + 10) * 3);
    expect(scorePlayer(player)).toBe(2460);
  });

  it('une famille complète unique n\'est pas multipliée', () => {
    const player = makePlayer({ cow: 4 });
    expect(scorePlayer(player)).toBe(800);
  });

  it('les familles incomplètes ne rapportent rien', () => {
    const player = makePlayer({ horse: 3, cow: 2, pig: 1 });
    expect(scorePlayer(player)).toBe(0);
  });

  it('deux familles complètes doublent le total', () => {
    const player = makePlayer({ horse: 4, cow: 4 });
    expect(scorePlayer(player)).toBe((1000 + 800) * 2);
  });
});
