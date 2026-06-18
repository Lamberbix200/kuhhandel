import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { config } from './config';
import { registerSocketHandlers } from './socket';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: config.isProd
    ? undefined
    : { origin: config.clientOrigin, credentials: true },
});

registerSocketHandlers(io);

httpServer.listen(config.port, () => {
  console.log(`[kuhhandel] serveur à l'écoute sur http://localhost:${config.port} (${config.nodeEnv})`);
});
