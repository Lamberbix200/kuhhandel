/** Identifiant d'une famille d'animaux (10 familles de 4 cartes). */
export type AnimalId =
  | 'rooster'
  | 'goose'
  | 'cat'
  | 'dog'
  | 'sheep'
  | 'goat'
  | 'donkey'
  | 'pig'
  | 'cow'
  | 'horse';

/** Valeurs faciales des cartes d'argent. */
export type Denomination = 0 | 10 | 50 | 100 | 200 | 500;

/** Une liasse d'argent : nombre de cartes par valeur faciale. */
export type Money = Record<Denomination, number>;

/** Définition statique d'une famille d'animaux. */
export interface AnimalDef {
  id: AnimalId;
  /** Nom affiché (français). */
  name: string;
  /** Points rapportés par la famille complète (4 cartes). */
  value: number;
  /** Visuel temporaire (emoji) en attendant les SVG. */
  emoji: string;
  /** Clé du son joué à la pioche. */
  sound: string;
}

/** État public+privé d'un joueur dans une partie. */
export interface PlayerState {
  id: string;
  name: string;
  /** Argent en main — caché aux autres joueurs. */
  money: Money;
  /** Cartes animaux possédées par famille (0 à 4) — public. */
  animals: Record<AnimalId, number>;
  connected: boolean;
}
