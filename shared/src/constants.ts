import type { AnimalDef, AnimalId, Denomination, Money, PlayerState } from './types';

/** Les 10 familles d'animaux, par valeur croissante. */
export const ANIMALS: readonly AnimalDef[] = [
  { id: 'rooster', name: 'Coq', value: 10, emoji: '🐓', sound: 'rooster' },
  { id: 'goose', name: 'Oie', value: 40, emoji: '🦢', sound: 'goose' },
  { id: 'cat', name: 'Chat', value: 90, emoji: '🐱', sound: 'cat' },
  { id: 'dog', name: 'Chien', value: 160, emoji: '🐶', sound: 'dog' },
  { id: 'sheep', name: 'Mouton', value: 250, emoji: '🐑', sound: 'sheep' },
  { id: 'goat', name: 'Chèvre', value: 350, emoji: '🐐', sound: 'goat' },
  { id: 'donkey', name: 'Âne', value: 500, emoji: '🫏', sound: 'donkey' },
  { id: 'pig', name: 'Cochon', value: 650, emoji: '🐷', sound: 'pig' },
  { id: 'cow', name: 'Vache', value: 800, emoji: '🐄', sound: 'cow' },
  { id: 'horse', name: 'Cheval', value: 1000, emoji: '🐴', sound: 'horse' },
];

/** Accès O(1) à une famille par son id. */
export const ANIMAL_BY_ID: Record<AnimalId, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
) as Record<AnimalId, AnimalDef>;

/** Toutes les valeurs faciales d'argent, croissantes. */
export const DENOMINATIONS: readonly Denomination[] = [0, 10, 50, 100, 200, 500];

/** Cartes par famille d'animaux. */
export const CARDS_PER_ANIMAL = 4;

/** Composition totale du paquet d'argent (55 cartes). */
export const MONEY_SUPPLY: Money = { 0: 10, 10: 20, 50: 10, 100: 5, 200: 5, 500: 5 };

/** Avoir de départ de chaque joueur : 2×0 + 4×10 + 1×50 = 90. */
export const STARTING_MONEY: Money = { 0: 2, 10: 4, 50: 1, 100: 0, 200: 0, 500: 0 };

/** Argent distribué à chaque joueur au 1er, 2e, 3e, 4e âne retourné. */
export const DONKEY_PAYOUTS: readonly number[] = [50, 100, 200, 500];

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

/** Pas minimal d'une enchère. */
export const BID_INCREMENT = 10;

/** Liasse vide (0 carte de chaque valeur). */
export function emptyMoney(): Money {
  return { 0: 0, 10: 0, 50: 0, 100: 0, 200: 0, 500: 0 };
}

/** Copie d'une liasse. */
export function cloneMoney(m: Money): Money {
  return { 0: m[0], 10: m[10], 50: m[50], 100: m[100], 200: m[200], 500: m[500] };
}

/** Avoir de départ d'un joueur (nouvelle liasse). */
export function startingMoney(): Money {
  return cloneMoney(STARTING_MONEY);
}

/** Valeur totale (en points/argent) d'une liasse. */
export function moneyValue(m: Money): number {
  return DENOMINATIONS.reduce<number>((sum, d) => sum + d * m[d], 0);
}

/** Nombre total de cartes d'argent dans une liasse. */
export function moneyCardCount(m: Money): number {
  return DENOMINATIONS.reduce<number>((sum, d) => sum + m[d], 0);
}

/** Vrai si `a` contient au moins toutes les cartes de `b` (b ⊆ a). */
export function moneyContains(a: Money, b: Money): boolean {
  return DENOMINATIONS.every((d) => a[d] >= b[d]);
}

/** Additionne deux liasses (nouvelle liasse). */
export function addMoney(a: Money, b: Money): Money {
  const out = emptyMoney();
  for (const d of DENOMINATIONS) out[d] = a[d] + b[d];
  return out;
}

/** Soustrait `b` de `a` (nouvelle liasse). Suppose b ⊆ a. */
export function subtractMoney(a: Money, b: Money): Money {
  const out = emptyMoney();
  for (const d of DENOMINATIONS) out[d] = a[d] - b[d];
  return out;
}

/** Dictionnaire d'animaux à 0 partout. */
export function emptyAnimals(): Record<AnimalId, number> {
  return {
    rooster: 0,
    goose: 0,
    cat: 0,
    dog: 0,
    sheep: 0,
    goat: 0,
    donkey: 0,
    pig: 0,
    cow: 0,
    horse: 0,
  };
}

/** Construit le paquet d'animaux : 4 cartes de chacune des 10 familles (40 cartes). */
export function buildAnimalDeck(): AnimalId[] {
  const deck: AnimalId[] = [];
  for (const animal of ANIMALS) {
    for (let i = 0; i < CARDS_PER_ANIMAL; i++) deck.push(animal.id);
  }
  return deck;
}

/**
 * Mélange Fisher-Yates avec une source d'aléa injectable (`rng` ∈ [0,1)),
 * pour des parties reproductibles dans les tests. Ne mute pas l'entrée.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Familles complètes (4 cartes) possédées par un joueur. */
export function completeFamilies(player: PlayerState): AnimalId[] {
  return ANIMALS.filter((a) => player.animals[a.id] === CARDS_PER_ANIMAL).map((a) => a.id);
}

/**
 * Score d'un joueur : somme des valeurs des familles complètes,
 * multipliée par le nombre de familles complètes. L'argent ne compte pas.
 * (Ex. 4 cochons + 4 chiens + 4 coqs = (650+160+10) × 3 = 2460.)
 */
export function scorePlayer(player: PlayerState): number {
  const families = completeFamilies(player);
  const sum = families.reduce((s, id) => s + ANIMAL_BY_ID[id].value, 0);
  return sum * families.length;
}
