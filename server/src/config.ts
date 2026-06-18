export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** Origine du client en développement (Vite). En prod, le serveur sert le statique. */
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  get isProd() {
    return this.nodeEnv === 'production';
  },
};
