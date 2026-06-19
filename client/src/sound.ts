// Moteur de sons synthétisés via la Web Audio API.
// Aucun fichier audio à télécharger : tout est généré à la volée (oscillateurs +
// bruit filtré). C'est donc 100 % original et libre de droits, et ça marche hors ligne.
// Des vraies voix d'animaux (CC0) pourront être déposées plus tard dans
// `client/public/sounds/<animal>.mp3` et préférées si présentes (voir playAnimal).

import { ANIMALS, ANIMAL_BY_ID } from '@kuhhandel/shared';
import type { AnimalId } from '@kuhhandel/shared';

const MUTE_KEY = 'kh_muted';

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Doit être appelé depuis un geste utilisateur (politique d'autoplay). */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

/* ----------------------- Vraies voix d'animaux (fichiers) ----------------------- */
// Fichiers optionnels dans client/public/sounds/<id>.<ext>, décodés via Web Audio
// (ogg/mp3/webm lus par Chrome/Edge/Firefox). Repli synthétisé si absent.
const animalBuffers = new Map<AnimalId, AudioBuffer>();
const triedLoad = new Set<AnimalId>();
const SOUND_EXTS = ['mp3', 'ogg', 'webm'];

async function loadAnimalSound(id: AnimalId): Promise<void> {
  if (triedLoad.has(id)) return;
  triedLoad.add(id);
  const c = getCtx();
  if (!c) return;
  for (const ext of SOUND_EXTS) {
    try {
      const res = await fetch(`/sounds/${id}.${ext}`);
      if (!res.ok) continue;
      const data = await res.arrayBuffer();
      animalBuffers.set(id, await c.decodeAudioData(data));
      return;
    } catch {
      /* on tente le format suivant */
    }
  }
}

/** Précharge les voix d'animaux disponibles (appelé au 1er geste utilisateur). */
export function preloadAnimalSounds(): void {
  for (const a of ANIMALS) void loadAnimalSound(a.id);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* stockage indisponible : on garde l'état en mémoire */
  }
}

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Glisse vers cette fréquence en fin de note (effet « bend »). */
  freqEnd?: number;
  /** Décalage de départ en secondes (pour enchaîner des notes). */
  when?: number;
}

function tone({ freq, dur, type = 'sine', gain = 0.18, freqEnd, when = 0 }: ToneOpts): void {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

interface NoiseOpts {
  dur?: number;
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  when?: number;
}

function noise({ dur = 0.12, gain = 0.12, type = 'highpass', freq = 1200, when = 0 }: NoiseOpts): void {
  const c = getCtx();
  if (!c || muted) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len); // burst qui décroît
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}

/* ------------------------------- Sons nommés ------------------------------- */

/** Tic du compte à rebours (chaque seconde). */
export function tick(): void {
  tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.1 });
}

/** Tic des 3 dernières secondes (plus aigu, plus pressant). */
export function tickUrgent(): void {
  tone({ freq: 1040, dur: 0.07, type: 'square', gain: 0.16 });
}

/** « Adjugé ! » : coup de marteau + petite fanfare montante. */
export function sold(): void {
  noise({ dur: 0.06, gain: 0.25, type: 'lowpass', freq: 400 }); // choc du marteau
  tone({ freq: 300, dur: 0.1, type: 'square', gain: 0.18, when: 0.0 });
  tone({ freq: 700, dur: 0.12, type: 'triangle', gain: 0.16, when: 0.09 });
  tone({ freq: 1050, dur: 0.16, type: 'triangle', gain: 0.16, when: 0.18 });
}

/** Une mise est posée : petit « cling » de pièce. */
export function bid(): void {
  tone({ freq: 1250, dur: 0.06, type: 'triangle', gain: 0.16 });
  tone({ freq: 1850, dur: 0.05, type: 'triangle', gain: 0.12, when: 0.03 });
}

/** Encaissement : « cha-ching » de plusieurs pièces. */
export function coin(): void {
  tone({ freq: 1500, dur: 0.07, type: 'triangle', gain: 0.14 });
  tone({ freq: 2000, dur: 0.07, type: 'triangle', gain: 0.12, when: 0.05 });
  tone({ freq: 2500, dur: 0.09, type: 'triangle', gain: 0.1, when: 0.1 });
}

/** Carte retournée / distribuée : petit « whoosh ». */
export function flip(): void {
  noise({ dur: 0.14, gain: 0.1, type: 'highpass', freq: 1800 });
}

/**
 * « Cri » de l'animal piochée. Faute de vraies voix, on synthétise une note
 * dont la hauteur dépend de la taille de l'animal (gros = grave, petit = aigu).
 */
export function playAnimal(id: AnimalId): void {
  const c = getCtx();
  const buffer = animalBuffers.get(id);
  if (c && !muted && buffer) {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(c.destination);
    src.start();
    return;
  }
  if (!buffer) void loadAnimalSound(id); // tentera de le charger pour la prochaine fois
  const value = ANIMAL_BY_ID[id]?.value ?? 100;
  const base = 760 - (value / 1000) * 520; // 10 pts -> ~755 Hz, 1000 pts -> ~240 Hz
  tone({ freq: base, dur: 0.28, type: 'sawtooth', gain: 0.16, freqEnd: base * 0.7 });
  tone({ freq: base * 2, dur: 0.22, type: 'triangle', gain: 0.06, freqEnd: base * 1.4 });
}

/** Victoire : arpège ascendant. */
export function fanfare(): void {
  [523, 659, 784, 1046].forEach((f, i) =>
    tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.16, when: i * 0.12 }),
  );
}

/** Défaite : deux notes descendantes. */
export function womp(): void {
  tone({ freq: 400, dur: 0.18, type: 'sawtooth', gain: 0.14 });
  tone({ freq: 280, dur: 0.28, type: 'sawtooth', gain: 0.14, when: 0.16 });
}

// Déverrouille le contexte audio au tout premier geste de l'utilisateur.
if (typeof window !== 'undefined') {
  const unlock = (): void => {
    unlockAudio();
    preloadAnimalSounds();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
