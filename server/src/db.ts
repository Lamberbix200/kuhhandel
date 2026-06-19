import { PrismaClient } from '@prisma/client';

/** Client Prisma partagé (singleton) pour toute la couche serveur. */
export const prisma = new PrismaClient();
