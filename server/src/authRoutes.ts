import { Router, type Request, type Response } from 'express';
import { config } from './config';
import { prisma } from './db';
import {
  AuthError,
  COOKIE_NAME,
  loginUser,
  registerUser,
  signToken,
  verifyToken,
} from './auth';

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, displayName, password } = req.body ?? {};
    const user = await registerUser({
      email: String(email ?? ''),
      displayName: String(displayName ?? ''),
      password: String(password ?? ''),
    });
    setAuthCookie(res, signToken(user));
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[auth] register', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    const user = await loginUser({ email: String(email ?? ''), password: String(password ?? '') });
    setAuthCookie(res, signToken(user));
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error('[auth] login', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  const claims = token ? verifyToken(token) : null;
  if (!claims) {
    res.status(401).json({ user: null });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ user: null });
    return;
  }
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
});
