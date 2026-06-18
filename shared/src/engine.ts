import type { AnimalId, Denomination, Money, PlayerState } from './types';
import {
  ANIMAL_BY_ID,
  BID_INCREMENT,
  DONKEY_PAYOUTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MONEY_SUPPLY,
  addMoney,
  buildAnimalDeck,
  cloneMoney,
  emptyAnimals,
  moneyContains,
  moneyValue,
  scorePlayer,
  shuffle,
  startingMoney,
  subtractMoney,
} from './constants';

/**
 * Moteur de jeu Kuhhandel — pur, déterministe, sans I/O.
 * L'état est entièrement sérialisable en JSON (aucun Set/Map/fonction),
 * pour être transmis tel quel aux clients via Socket.IO.
 */

export type GamePhase =
  | 'waiting' // en attente du démarrage
  | 'turn_start' // le meneur choisit : enchère, marchandage, ou passer
  | 'auction' // enchère : mises en cours
  | 'auction_decision' // enchère close : le meneur exerce ou non son droit de préemption
  | 'auction_payment' // un joueur doit régler la carte adjugée
  | 'trade_offer' // marchandage : la cible doit accepter ou contrer
  | 'trade_reoffer' // égalité : l'initiateur doit refaire une offre
  | 'finished';

export interface AuctionState {
  animal: AnimalId;
  highestBid: number;
  highestBidderId: string | null;
  /** Enchérisseurs éligibles ayant passé depuis la dernière relance. */
  passed: string[];
}

export interface TradeState {
  initiatorId: string;
  targetId: string;
  animal: AnimalId;
  /** Nombre de cartes en jeu (2 = marchandage spécial, sinon 1). */
  count: number;
  /** Offre scellée de l'initiateur (cartes mises en réserve), ou null. */
  initiatorOffer: Money | null;
  /** Contre-offre scellée de la cible, ou null tant qu'elle n'a pas répondu. */
  targetOffer: Money | null;
  /** true après une première égalité (une seconde égalité = cession gratuite). */
  isReoffer: boolean;
}

export interface PendingPayment {
  payerId: string;
  recipientId: string;
  amount: number;
  animal: AnimalId;
  /** Qui reçoit la (les) carte(s) animal. */
  cardToId: string;
  count: number;
}

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  /** Pioche d'animaux ; le sommet est le DERNIER élément (pop). */
  deck: AnimalId[];
  /** Réserve d'argent (seconde pile) servant aux distributions de l'âne. */
  bank: Money;
  leaderIndex: number;
  /** Nombre d'ânes déjà retournés (0 à 4). */
  donkeysDrawn: number;
  auction: AuctionState | null;
  trade: TradeState | null;
  pendingPayment: PendingPayment | null;
  log: string[];
  winnerIds: string[] | null;
}

export type GameAction =
  | { type: 'START'; seed?: number }
  | { type: 'CHOOSE_AUCTION' }
  | { type: 'BID'; amount: number }
  | { type: 'PASS' }
  | { type: 'AUCTION_DECISION'; preempt: boolean }
  | { type: 'PAY'; payment: Money }
  | { type: 'CHOOSE_TRADE'; targetId: string; animal: AnimalId; offer: Money }
  | { type: 'TRADE_ACCEPT' }
  | { type: 'TRADE_COUNTER'; offer: Money }
  | { type: 'TRADE_REOFFER'; offer: Money }
  | { type: 'PASS_TURN' };

/** Erreur de règle (coup illégal). Le serveur la transmet au client fautif. */
export class GameError extends Error {}

function fail(message: string): never {
  throw new GameError(message);
}

/** PRNG mulberry32 déterministe à partir d'une graine entière. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crée une partie en attente à partir d'une liste de joueurs (id + nom). */
export function createGame(players: { id: string; name: string }[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    fail(`Le nombre de joueurs doit être entre ${MIN_PLAYERS} et ${MAX_PLAYERS}.`);
  }
  return {
    phase: 'waiting',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      money: startingMoney(),
      animals: emptyAnimals(),
      connected: true,
    })),
    deck: [],
    bank: cloneMoney(MONEY_SUPPLY),
    leaderIndex: 0,
    donkeysDrawn: 0,
    auction: null,
    trade: null,
    pendingPayment: null,
    log: [],
    winnerIds: null,
  };
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function playerById(state: GameState, id: string): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) fail('Joueur inconnu.');
  return p;
}

function leader(state: GameState): PlayerState {
  const p = state.players[state.leaderIndex];
  if (!p) fail('Meneur introuvable.');
  return p;
}

/** Enchérisseurs éligibles : connectés et différents du meneur. */
function eligibleBidders(state: GameState): PlayerState[] {
  const leaderId = leader(state).id;
  return state.players.filter((p) => p.connected && p.id !== leaderId);
}

/** Toutes les familles sont-elles complètes (chacune entièrement chez un joueur) ? */
function allFamiliesComplete(state: GameState): boolean {
  return (Object.keys(ANIMAL_BY_ID) as AnimalId[]).every((id) =>
    state.players.some((p) => p.animals[id] === 4),
  );
}

/** Le meneur a-t-il au moins un marchandage possible ? */
function leaderCanTrade(state: GameState): boolean {
  const me = leader(state);
  return state.players.some(
    (other) =>
      other.id !== me.id &&
      other.connected &&
      (Object.keys(ANIMAL_BY_ID) as AnimalId[]).some(
        (id) => me.animals[id] > 0 && other.animals[id] > 0,
      ),
  );
}

/** Termine la partie : calcule les gagnants (score max, égalités possibles). */
function finish(state: GameState): void {
  const scores = state.players.map((p) => scorePlayer(p));
  const max = Math.max(...scores);
  state.winnerIds = state.players.filter((_, i) => scores[i] === max).map((p) => p.id);
  state.phase = 'finished';
  state.auction = null;
  state.trade = null;
  state.pendingPayment = null;
}

/** Passe la main au prochain joueur connecté et nettoie l'état transitoire. */
function advanceTurn(state: GameState): void {
  state.auction = null;
  state.trade = null;
  state.pendingPayment = null;

  if (state.deck.length === 0 && allFamiliesComplete(state)) {
    finish(state);
    return;
  }

  const n = state.players.length;
  let idx = state.leaderIndex;
  for (let step = 0; step < n; step++) {
    idx = (idx + 1) % n;
    if (state.players[idx]?.connected) break;
  }
  state.leaderIndex = idx;
  state.phase = 'turn_start';
}

/** Distribue à chaque joueur une carte de l'âne n°(index+1) depuis la réserve. */
function donkeyPayout(state: GameState, index: number): void {
  const denom = DONKEY_PAYOUTS[index] as Denomination | undefined;
  if (denom === undefined) return;
  for (const p of state.players) {
    if (state.bank[denom] > 0) {
      state.bank[denom]--;
      p.money[denom]++;
    }
  }
  state.log.push(`🫏 Âne n°${index + 1} : chaque joueur reçoit ${denom}.`);
}

/** Donne `count` cartes `animal` du perdant au gagnant (marchandage). */
function transferAnimals(
  from: PlayerState,
  to: PlayerState,
  animal: AnimalId,
  count: number,
): void {
  from.animals[animal] -= count;
  to.animals[animal] += count;
}

/** Applique une action et renvoie le nouvel état (immuable : l'entrée n'est pas mutée). */
export function applyAction(prev: GameState, actorId: string, action: GameAction): GameState {
  const state = clone(prev);

  switch (action.type) {
    case 'START': {
      if (state.phase !== 'waiting') fail('La partie a déjà commencé.');
      if (!state.players.some((p) => p.id === actorId)) fail('Action réservée aux joueurs.');
      if (state.players.length < MIN_PLAYERS) fail(`Il faut au moins ${MIN_PLAYERS} joueurs.`);
      const rng = action.seed !== undefined ? mulberry32(action.seed) : Math.random;
      state.deck = shuffle(buildAnimalDeck(), rng);
      // La réserve = stock total moins l'avoir de départ distribué à chacun.
      let bank = cloneMoney(MONEY_SUPPLY);
      for (const p of state.players) bank = subtractMoney(bank, p.money);
      state.bank = bank;
      state.leaderIndex = Math.floor(rng() * state.players.length);
      state.phase = 'turn_start';
      state.log.push('La partie commence !');
      return state;
    }

    case 'CHOOSE_AUCTION': {
      if (state.phase !== 'turn_start') fail("Ce n'est pas le moment de lancer une enchère.");
      if (actorId !== leader(state).id) fail("Seul le meneur peut lancer une enchère.");
      if (state.deck.length === 0) fail("Il n'y a plus de carte à mettre aux enchères.");
      const animal = state.deck.pop()!;
      if (animal === 'donkey') {
        donkeyPayout(state, state.donkeysDrawn);
        state.donkeysDrawn++;
      }
      state.auction = { animal, highestBid: 0, highestBidderId: null, passed: [] };
      state.phase = 'auction';
      state.log.push(`Enchère : ${ANIMAL_BY_ID[animal].name}.`);
      return state;
    }

    case 'BID': {
      if (state.phase !== 'auction' || !state.auction) fail("Aucune enchère en cours.");
      const a = state.auction;
      if (actorId === leader(state).id) fail("Le meneur ne peut pas miser.");
      const bidder = playerById(state, actorId);
      if (!bidder.connected) fail('Joueur déconnecté.');
      if (action.amount % BID_INCREMENT !== 0) fail(`Les mises sont des multiples de ${BID_INCREMENT}.`);
      if (action.amount <= a.highestBid) fail('La mise doit dépasser la mise courante.');
      if (action.amount < BID_INCREMENT) fail(`La mise minimale est ${BID_INCREMENT}.`);
      if (moneyValue(bidder.money) < action.amount) fail('Tu ne peux pas payer cette mise.');
      a.highestBid = action.amount;
      a.highestBidderId = actorId;
      a.passed = []; // une relance rouvre la parole à tout le monde
      state.log.push(`${bidder.name} mise ${action.amount}.`);
      return state;
    }

    case 'PASS': {
      if (state.phase !== 'auction' || !state.auction) fail("Aucune enchère en cours.");
      const a = state.auction;
      if (actorId === leader(state).id) fail("Le meneur ne participe pas aux enchères.");
      if (actorId === a.highestBidderId) fail('Tu es déjà le meilleur enchérisseur.');
      if (!a.passed.includes(actorId)) a.passed.push(actorId);

      const eligible = eligibleBidders(state);
      const everyoneSettled = eligible.every(
        (p) => p.id === a.highestBidderId || a.passed.includes(p.id),
      );
      if (everyoneSettled) {
        if (a.highestBidderId === null) {
          // Personne n'a misé : le meneur emporte la carte gratuitement.
          const me = leader(state);
          me.animals[a.animal]++;
          state.log.push(`${me.name} emporte ${ANIMAL_BY_ID[a.animal].name} gratuitement.`);
          advanceTurn(state);
        } else {
          state.phase = 'auction_decision';
        }
      }
      return state;
    }

    case 'AUCTION_DECISION': {
      if (state.phase !== 'auction_decision' || !state.auction) fail("Aucune enchère à clore.");
      if (actorId !== leader(state).id) fail('Décision réservée au meneur.');
      const a = state.auction;
      if (a.highestBidderId === null) fail('Aucune mise à départager.');
      const me = leader(state);
      if (action.preempt) {
        if (moneyValue(me.money) < a.highestBid) fail('Tu ne peux pas exercer la préemption.');
        state.pendingPayment = {
          payerId: me.id,
          recipientId: a.highestBidderId,
          amount: a.highestBid,
          animal: a.animal,
          cardToId: me.id,
          count: 1,
        };
        state.log.push(`${me.name} exerce son droit de préemption.`);
      } else {
        state.pendingPayment = {
          payerId: a.highestBidderId,
          recipientId: me.id,
          amount: a.highestBid,
          animal: a.animal,
          cardToId: a.highestBidderId,
          count: 1,
        };
      }
      state.phase = 'auction_payment';
      return state;
    }

    case 'PAY': {
      if (state.phase !== 'auction_payment' || !state.pendingPayment) fail('Aucun paiement attendu.');
      const pp = state.pendingPayment;
      if (actorId !== pp.payerId) fail("Ce n'est pas à toi de payer.");
      const payer = playerById(state, pp.payerId);
      const recipient = playerById(state, pp.recipientId);
      if (!moneyContains(payer.money, action.payment)) fail("Tu ne possèdes pas ces cartes.");
      if (moneyValue(action.payment) < pp.amount) {
        fail(`Le paiement doit valoir au moins ${pp.amount} (pas de monnaie rendue).`);
      }
      payer.money = subtractMoney(payer.money, action.payment);
      recipient.money = addMoney(recipient.money, action.payment);
      const cardTo = playerById(state, pp.cardToId);
      cardTo.animals[pp.animal] += pp.count;
      state.log.push(
        `${cardTo.name} obtient ${ANIMAL_BY_ID[pp.animal].name} pour ${moneyValue(action.payment)}.`,
      );
      advanceTurn(state);
      return state;
    }

    case 'CHOOSE_TRADE': {
      if (state.phase !== 'turn_start') fail("Ce n'est pas le moment de marchander.");
      if (actorId !== leader(state).id) fail('Seul le meneur peut proposer un marchandage.');
      if (action.targetId === actorId) fail('Tu ne peux pas marchander avec toi-même.');
      const me = leader(state);
      const target = playerById(state, action.targetId);
      if (!target.connected) fail('Ce joueur est déconnecté.');
      if (me.animals[action.animal] < 1 || target.animals[action.animal] < 1) {
        fail('Vous devez tous les deux posséder cet animal pour marchander.');
      }
      if (!moneyContains(me.money, action.offer)) fail("Tu ne possèdes pas ces cartes.");
      const count = me.animals[action.animal] >= 2 && target.animals[action.animal] >= 2 ? 2 : 1;
      me.money = subtractMoney(me.money, action.offer); // mise sous séquestre
      state.trade = {
        initiatorId: me.id,
        targetId: target.id,
        animal: action.animal,
        count,
        initiatorOffer: action.offer,
        targetOffer: null,
        isReoffer: false,
      };
      state.phase = 'trade_offer';
      state.log.push(`${me.name} propose un marchandage à ${target.name} (${ANIMAL_BY_ID[action.animal].name}).`);
      return state;
    }

    case 'TRADE_ACCEPT': {
      if (state.phase !== 'trade_offer' || !state.trade) fail('Aucun marchandage en cours.');
      const t = state.trade;
      if (actorId !== t.targetId) fail("Ce n'est pas à toi de répondre.");
      const initiator = playerById(state, t.initiatorId);
      const target = playerById(state, t.targetId);
      if (!t.initiatorOffer) fail('Offre initiale manquante.');
      // La cible cède les animaux et conserve l'argent offert.
      transferAnimals(target, initiator, t.animal, t.count);
      target.money = addMoney(target.money, t.initiatorOffer);
      state.log.push(`${target.name} accepte : ${initiator.name} obtient ${ANIMAL_BY_ID[t.animal].name}.`);
      advanceTurn(state);
      return state;
    }

    case 'TRADE_COUNTER': {
      if (state.phase !== 'trade_offer' || !state.trade) fail('Aucun marchandage en cours.');
      const t = state.trade;
      if (actorId !== t.targetId) fail("Ce n'est pas à toi de répondre.");
      const initiator = playerById(state, t.initiatorId);
      const target = playerById(state, t.targetId);
      if (!t.initiatorOffer) fail('Offre initiale manquante.');
      if (!moneyContains(target.money, action.offer)) fail("Tu ne possèdes pas ces cartes.");
      target.money = subtractMoney(target.money, action.offer); // séquestre
      const offerA = t.initiatorOffer;
      const offerB = action.offer;
      const va = moneyValue(offerA);
      const vb = moneyValue(offerB);

      if (va === vb) {
        // Égalité : on rend les mises.
        initiator.money = addMoney(initiator.money, offerA);
        target.money = addMoney(target.money, offerB);
        if (t.isReoffer) {
          // Seconde égalité : la cible cède gratuitement.
          transferAnimals(target, initiator, t.animal, t.count);
          state.log.push(`Double égalité : ${target.name} cède ${ANIMAL_BY_ID[t.animal].name} gratuitement.`);
          advanceTurn(state);
        } else {
          t.isReoffer = true;
          t.initiatorOffer = null;
          t.targetOffer = null;
          state.phase = 'trade_reoffer';
          state.log.push(`Égalité : ${initiator.name} doit refaire une offre.`);
        }
        return state;
      }

      // Le plus offrant remporte l'animal ; les mises sont échangées.
      const initiatorWins = va > vb;
      initiator.money = addMoney(initiator.money, offerB);
      target.money = addMoney(target.money, offerA);
      if (initiatorWins) {
        transferAnimals(target, initiator, t.animal, t.count);
        state.log.push(`${initiator.name} l'emporte et obtient ${ANIMAL_BY_ID[t.animal].name}.`);
      } else {
        transferAnimals(initiator, target, t.animal, t.count);
        state.log.push(`${target.name} l'emporte et conserve ${ANIMAL_BY_ID[t.animal].name}.`);
      }
      advanceTurn(state);
      return state;
    }

    case 'TRADE_REOFFER': {
      if (state.phase !== 'trade_reoffer' || !state.trade) fail('Aucune nouvelle offre attendue.');
      const t = state.trade;
      if (actorId !== t.initiatorId) fail("Ce n'est pas à toi de refaire une offre.");
      const initiator = playerById(state, t.initiatorId);
      if (!moneyContains(initiator.money, action.offer)) fail("Tu ne possèdes pas ces cartes.");
      initiator.money = subtractMoney(initiator.money, action.offer);
      t.initiatorOffer = action.offer;
      t.targetOffer = null;
      state.phase = 'trade_offer';
      return state;
    }

    case 'PASS_TURN': {
      if (state.phase !== 'turn_start') fail('Tu ne peux pas passer maintenant.');
      if (actorId !== leader(state).id) fail('Seul le meneur peut passer.');
      if (state.deck.length > 0) fail('Tu dois lancer une enchère tant qu\'il reste des cartes.');
      if (leaderCanTrade(state)) fail('Un marchandage est possible : tu dois marchander.');
      state.log.push(`${leader(state).name} passe son tour.`);
      advanceTurn(state);
      return state;
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * Vue d'un joueur : masque l'argent des adversaires et les offres scellées,
 * pour ne jamais divulguer d'information cachée côté client.
 */
export interface PublicPlayer {
  id: string;
  name: string;
  animals: Record<AnimalId, number>;
  /** Nombre total de cartes d'argent (visible), mais pas leur valeur. */
  moneyCardCount: number;
  connected: boolean;
}

export interface PlayerView {
  phase: GamePhase;
  you: PlayerState; // ton état complet (argent inclus)
  players: PublicPlayer[];
  deckCount: number;
  leaderIndex: number;
  donkeysDrawn: number;
  auction: AuctionState | null;
  /** Marchandage en cours, offres scellées masquées. */
  trade: (Omit<TradeState, 'initiatorOffer' | 'targetOffer'> & {
    hasInitiatorOffer: boolean;
    hasTargetOffer: boolean;
  }) | null;
  pendingPayment: PendingPayment | null;
  log: string[];
  winnerIds: string[] | null;
}

/** Projette l'état complet vers la vue d'un joueur (information cachée masquée). */
export function viewFor(state: GameState, playerId: string): PlayerView {
  const you = state.players.find((p) => p.id === playerId);
  if (!you) fail('Joueur absent de la partie.');
  return {
    phase: state.phase,
    you: structuredClone(you),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      animals: { ...p.animals },
      moneyCardCount: (Object.values(p.money) as number[]).reduce((s, n) => s + n, 0),
      connected: p.connected,
    })),
    deckCount: state.deck.length,
    leaderIndex: state.leaderIndex,
    donkeysDrawn: state.donkeysDrawn,
    auction: state.auction ? { ...state.auction, passed: [...state.auction.passed] } : null,
    trade: state.trade
      ? {
          initiatorId: state.trade.initiatorId,
          targetId: state.trade.targetId,
          animal: state.trade.animal,
          count: state.trade.count,
          isReoffer: state.trade.isReoffer,
          hasInitiatorOffer: state.trade.initiatorOffer !== null,
          hasTargetOffer: state.trade.targetOffer !== null,
        }
      : null,
    pendingPayment: state.pendingPayment,
    log: state.log,
    winnerIds: state.winnerIds,
  };
}
