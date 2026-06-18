# Kuhhandel en ligne

Version multijoueur en ligne du jeu de cartes **Kuhhandel** (Ravensburger). Salons de 3 à 5 joueurs, enchères, marchandage (bluff), sons et animations.

## Stack

- **Monorepo** npm workspaces en TypeScript.
- `shared/` — moteur de jeu pur et testé (règles, enchères, marchandage, score). Aucune dépendance d'I/O.
- `server/` — Node + Express + Socket.IO (état de partie autoritatif), PostgreSQL + Prisma, auth email/mot de passe (JWT cookie httpOnly).
- `client/` — React + Vite + Tailwind + Framer Motion + Howler.js.

## Développement

```bash
npm install            # installe tous les workspaces
npm test               # tests du moteur de jeu (shared)
npm run typecheck      # vérification de types sur tous les workspaces
```

## Déploiement

Cible : **Render** — un Web Service (sert le client compilé + l'API + le WebSocket) + une base PostgreSQL.

## Statut

En cours de construction. Voir la liste de tâches du projet.
