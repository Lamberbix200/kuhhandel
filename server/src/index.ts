import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@kuhhandel/shared';
import { config } from './config';
import { registerSocketHandlers } from './socket';
import { authRouter } from './authRoutes';

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv });
});

app.use('/api/auth', authRouter);

// En production, le serveur sert aussi le client compilé (même origine).
if (config.isProd) {
  const clientDist = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

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
