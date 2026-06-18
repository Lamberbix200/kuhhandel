import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '@kuhhandel/shared';
import { registerSocketHandlers } from './socket';

let httpServer: HttpServer;
let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  ioServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerSocketHandlers(ioServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(() => {
  ioServer.close();
  httpServer.close();
});

function connect(guestId: string, displayName: string): ClientSocket {
  return connectClient(`http://localhost:${port}`, {
    auth: { guestId, displayName },
    transports: ['websocket'],
    forceNew: true,
  });
}

function once<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (...a: unknown[]) => void));
}

function emitAck<T = unknown>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve as (r: unknown) => void));
}

test('lobby, démarrage et masquage de l\'information cachée', async () => {
  const a = connect('a', 'Alice');
  const b = connect('b', 'Bob');
  const c = connect('c', 'Carol');
  await Promise.all([once(a, 'connect'), once(b, 'connect'), once(c, 'connect')]);

  // Alice crée un salon ; Bob et Carol le rejoignent.
  const created = await emitAck<{ ok: boolean; roomId: string }>(a, 'room:create', { name: 'Partie test' });
  expect(created.ok).toBe(true);
  const code = created.roomId;

  const joinB = await emitAck<{ ok: boolean }>(b, 'room:join', { code });
  const joinC = await emitAck<{ ok: boolean }>(c, 'room:join', { code });
  expect(joinB.ok && joinC.ok).toBe(true);

  // Un non-hôte ne peut pas démarrer.
  const errPromise = once<string>(b, 'error:msg');
  b.emit('room:start');
  expect(await errPromise).toMatch(/hôte/i);

  // L'hôte démarre : tout le monde reçoit sa vue de partie.
  const views = Promise.all([
    once<any>(a, 'game:view'),
    once<any>(b, 'game:view'),
    once<any>(c, 'game:view'),
  ]);
  a.emit('room:start');
  const [va] = await views;

  expect(va.phase).toBe('turn_start');
  // Argent propre visible et correct (2×0 + 4×10 + 1×50 = 90).
  const ownValue = 0 * va.you.money[0] + 10 * va.you.money[10] + 50 * va.you.money[50];
  expect(ownValue).toBe(90);
  // Adversaires : seul le nombre de cartes est visible (7 cartes), pas leur valeur.
  const bSeenByA = va.players.find((p: any) => p.name === 'Bob');
  expect(bSeenByA.moneyCardCount).toBe(7);
  expect(bSeenByA.money).toBeUndefined();

  // Le meneur lance une enchère ; tout le monde voit la phase 'auction'.
  const socketByUser: Record<string, ClientSocket> = { 'guest:a': a, 'guest:b': b, 'guest:c': c };
  const leaderSocket = socketByUser[va.players[va.leaderIndex].id]!;
  const afterAuction = once<any>(leaderSocket, 'game:view');
  leaderSocket.emit('game:action', { type: 'CHOOSE_AUCTION' });
  const v2 = await afterAuction;
  expect(v2.phase).toBe('auction');
  expect(v2.auction).not.toBeNull();

  a.disconnect();
  b.disconnect();
  c.disconnect();
}, 15000);
