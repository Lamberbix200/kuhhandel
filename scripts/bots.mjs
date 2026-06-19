// Bots de test : rejoignent un salon existant et jouent le minimum pour que je
// puisse observer le plateau depuis le navigateur (lancent les enchères quand ils
// sont meneurs, laissent l'animal au plus offrant). Usage :
//   node scripts/bots.mjs <CODE_SALON> [nbBots=2] [url=http://localhost:3001]
import { io } from 'socket.io-client';

const code = (process.argv[2] || '').toUpperCase();
const count = Number(process.argv[3] || 2);
const url = process.argv[4] || 'http://localhost:3001';
if (!code) {
  console.error('Donne le code du salon : node scripts/bots.mjs <CODE>');
  process.exit(1);
}

const NAMES = ['Bot Bob', 'Bot Carol', 'Bot Dave', 'Bot Erin'];

function spawnBot(i) {
  const name = NAMES[i] || `Bot ${i}`;
  const socket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    auth: { guestId: `bot_${i}_${Math.random().toString(36).slice(2, 8)}`, displayName: name },
  });

  socket.on('connect', () => {
    socket.emit('room:join', { code }, (res) => {
      console.log(`[${name}] join ${code}:`, res.ok ? 'ok' : res.error);
    });
  });

  socket.on('error:msg', (m) => console.log(`[${name}] erreur:`, m));

  socket.on('game:view', (v) => {
    const me = v.you.id;
    const leader = v.players[v.leaderIndex]?.id;
    if (v.phase === 'turn_start' && leader === me) {
      // Meneur : on lance toujours une enchère s'il reste des cartes.
      if (v.deckCount > 0) socket.emit('game:action', { type: 'CHOOSE_AUCTION' });
      else socket.emit('game:action', { type: 'PASS_TURN' });
    } else if (v.phase === 'auction_decision' && leader === me) {
      // On laisse l'animal au plus offrant (pas de préemption).
      socket.emit('game:action', { type: 'AUCTION_DECISION', preempt: false });
    }
  });
}

for (let i = 0; i < count; i++) spawnBot(i);
console.log(`${count} bots lancés sur ${url}, salon ${code}.`);
