# Kuhhandel en ligne

Version multijoueur en ligne du jeu de cartes **Kuhhandel** (Ravensburger). Salons de 3 à 5 joueurs, enchères minutées, marchandage (bluff), sons et animations.

## Stack

- **Monorepo** npm workspaces en TypeScript.
- `shared/` — moteur de jeu pur et testé (règles, enchères, marchandage, score). Aucune dépendance d'I/O.
- `server/` — Node + Express + Socket.IO (état de partie autoritatif), PostgreSQL + Prisma, auth email/mot de passe (JWT cookie httpOnly).
- `client/` — React + Vite + Tailwind ; cartes et illustrations en SVG, sons synthétisés via la Web Audio API, animations CSS.

## Développement

Prérequis : Node ≥ 20 et Docker (pour Postgres).

```bash
npm install                                      # installe tous les workspaces
docker compose up -d                             # démarre Postgres (port 5432)
npm run db:migrate --workspace @kuhhandel/server # applique le schéma Prisma
npm run dev                                       # serveur (:3001) + client (:5173)
```

Ouvrir http://localhost:5173. Pour tester à plusieurs en local : créer un salon, noter le
code, puis `node scripts/bots.mjs <CODE>` lance des bots qui rejoignent la partie.

```bash
npm test          # tests (moteur + temps réel)
npm run typecheck # vérification de types sur tous les workspaces
```

Variables d'environnement serveur : voir `server/.env.example` (`DATABASE_URL`, `JWT_SECRET`).

## Déploiement (Render)

Le fichier `render.yaml` est un Blueprint : un Web Service Node (qui sert le client
compilé + l'API + le WebSocket) plus une base PostgreSQL, dans la même région.

1. Pousser le dépôt sur GitHub.
2. Sur https://dashboard.render.com → **New +** → **Blueprint**, sélectionner ce repo.
3. Render lit `render.yaml`, crée la base et le service, génère `JWT_SECRET` et injecte
   `DATABASE_URL` automatiquement. Le build lance `prisma migrate deploy`.
4. Au déploiement, le service est servi sur son URL `*.onrender.com`.

> Plan gratuit : le service s'endort après ~15 min d'inactivité (démarrage à froid, et
> les WebSockets se coupent) et la base expire après ~90 jours. Passer en plan « Starter »
> pour une partie continue.

## Statut

Jouable : moteur, lobby/salons temps réel, plateau en cartes, enchères minutées, comptes.
Reste : illustrations/sons enrichis, passe responsive, mise en ligne.
