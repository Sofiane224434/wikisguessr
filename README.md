# WikisGuessr

Application full-stack (React + Vite cote front, Node/Express + MySQL cote back) deployable en production via Docker Compose et GitHub Actions.

## Stack

- Frontend : React 19, Vite 7, Tailwind, i18next
- Backend : Node 20, Express 5, mysql2, JWT
- Base de donnees : MySQL 8
- Reverse proxy interne : Nginx (conteneur frontend) qui sert le build et proxie `/api` vers le backend
- Reverse proxy public : Nginx hote + Certbot
- CI/CD : GitHub Actions -> SSH -> `docker compose up -d --build`

## Developpement local

```bash
# A la racine
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Lancer backend + frontend + script de traduction
npm run dev
```

Backend : http://localhost:5000
Frontend : http://localhost:5173

Simulation CLI knowledge (A -> Z simplifie) :

```bash
npm run smoke:knowledge-sim
```

Ce script :
- se connecte,
- cree une partie `knowledge`,
- prend les 10 premiers liens jouables de l article de depart,
- simule un parcours intermediaire,
- force la fin sur la cible,
- appelle le quiz IA et affiche les questions + choix + `sourceQuote` en console,
- enregistre aussi le dernier quiz dans `scripts/smoke-knowledge-last.txt`.

Variables optionnelles :
- `SMOKE_BASE_URL` (defaut: `http://127.0.0.1:5000/api`)
- `SMOKE_KNOWLEDGE_IDENTIFIER` (defaut: `autotestquiz`)
- `SMOKE_KNOWLEDGE_PASSWORD` (defaut: `Test1234!`)
- `SMOKE_KNOWLEDGE_MAX_STEPS` (defaut: `10`)
- `SMOKE_KNOWLEDGE_OUTPUT_FILE` (chemin du fichier de sortie, defaut: `scripts/smoke-knowledge-last.txt`)

Connexion utilisateur : l'authentification accepte l'email ou le username (champ unique) avec le mot de passe.
Quand un utilisateur est deja connecte, les pages `/` et `/login` redirigent automatiquement vers `/lobby`.

Creation de partie MVP : depuis `/lobby` (utilisateur connecte), choisir le mode avec un bouton puis cliquer sur "Lancer". Un code de partie unique est genere et la partie s'ouvre sur `/game`.
Aleatoire MVP : les articles de depart/cible sont tires aleatoirement depuis `backend/src/data/wiki-articles.json` (pages Wikipedia connues et noms communs, ex: `Couleur`, `Science`, `Internet`).
Boucle de jeu MVP : la page `/game` recupere le contenu Wikipedia en `mobile-html` via le backend (`/api/wiki/mobile-html`) puis le rend dans l'interface sans iframe, en gardant la navigation interne dans la boucle, les images et le chronometre.
Mode chrono : depart a 5 minutes et 300 points. Les points descendent plus lentement: `1 point toutes les 2 secondes` (soit `10 points en 20 s`). Chaque changement d'article via un lien ajoute `+5 s` au chrono mais retire `-10 points`. La partie est perdue si le temps ou les points atteignent 0.

## Fonctionnalites sociales (Lobby)

### Gestion des amis
- Ajouter un ami par username ou email depuis le `/lobby`
- Liste des amis visible dans la colonne "Amis" avec compteur
- Supprimer un ami avec le bouton ✕
- Les amitie sont stockees dans la table `friendships` (relation bidirectionnelle)

### Système de chat par salon
- Discussion en direct depuis le `/lobby` visible uniquement dans le salon courant
- Les messages sont stockes dans la table `room_messages` avec timestamps
- Affichage des 30 derniers messages par defaut, scrollable si nombreux
- Support Enter pour envoyer un message
- Polling toutes les 2 secondes pour afficher les nouveaux messages en temps quasi-reel
- Les messages sont limites a 500 caracteres

### Layout compact du Lobby
- Grille 4 colonnes sur grands ecrans: Mon salon | Rejoindre | Lancer | Amis
- Chat du salon en pleine largeur en bas
- Entierement visible sans scroll vertical (optimisation mobile-first)
- Responsive avec empilement sur petits ecrans

### APIs sociales (authentifiees)
- `POST /api/friends/add` - ajouter un ami par identifier (username/email)
- `GET /api/friends/list` - lister les amis de l'utilisateur
- `POST /api/friends/remove` - supprimer un ami
- `POST /api/room-messages/send` - envoyer un message dans un salon
- `GET /api/room-messages/list` - charger l'historique des messages
- `GET /api/room-messages/new` - polling: charger les messages depuis un timestamp

Resultats et classement :
- A la fin de chaque partie (victoire ou defaite chrono), le front appelle `POST /api/games/:code/result`.
- Pour le mode connaissance, le score du quiz (0-5) est envoye en `PATCH /api/games/:code/result/knowledge-score` quand le joueur valide ses reponses.
- `GET /api/games/history` retourne l'historique personnel des 30 dernieres parties (authentifie).
- `GET /api/games/leaderboard?mode=all|normal|chrono|knowledge` retourne le classement global ou par mode (authentifie).
- La page `/leaderboard` affiche le classement avec onglets par mode.
- La page `/profile` affiche les statistiques personnelles (parties, victoires, taux) et l'historique complet.
- La table `game_results` est creee automatiquement au premier appel (`CREATE TABLE IF NOT EXISTS`).

Variables backend (`backend/.env`) :

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=...
DB_NAME=wikisguessr
JWT_SECRET=...
CORS_ORIGIN=http://localhost:5173
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=...
BREVO_SENDER_NAME=WikisGuessr
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```

Quiz IA mode connaissance :

- Quand une partie `knowledge` est gagnee, le front appelle `POST /api/games/:code/knowledge-quiz`.
- Le backend envoie un seul prompt a Gemini avec les articles intermediaires visites et demande 5 QCM.
- Le quiz knowledge est strictement IA: si Gemini est indisponible (quota, API down, reponse invalide, config absente), l API retourne une erreur sans fallback local.
- Si le contexte de navigation est vide (aucun article intermediaire), l API repond en `400` avec un message explicite.
- Les questions sont forcees vers des details lisibles dans les extraits (pas de culture generale) et incluent une courte citation source (`sourceQuote`).

Consommation IA (admin) :

- L admin affiche les compteurs de consommation du quiz knowledge (appels, tokens prompt/generation/total, dernieres executions).
- L admin affiche aussi le restant quotidien estime (`remainingDailyCalls`) avec une limite configurable via `GEMINI_DAILY_REQUEST_LIMIT` (500 par defaut).
- Optionnel: configurer `GEMINI_DAILY_TOKEN_LIMIT` pour afficher un restant tokens.
- Endpoint backend: `GET /api/games/knowledge-quiz/usage` (acces admin uniquement).

Mode demo offline (examen) :

- Le fichier `backend/src/data/wiki-offline-demo.json` contient les pages Wikipedia mises en cache et des matchups separes par mode (`normal`, `chrono`, `knowledge`).
- Le mode `normal` garde son parcours de reference (`Internet` -> `Quebec`).
- Les modes `chrono` et `knowledge` utilisent des articles differents du mode `normal`.
- Pour forcer ce parcours sans dependre d Internet, activer `OFFLINE_DEMO_MODE=true` dans l environnement backend puis relancer l API.
- En mode force, la creation de partie utilise les matchups du JSON et le endpoint `/api/wiki/mobile-html` sert les pages du JSON.
- Meme sans mode force, si Wikipedia est indisponible, l API tente automatiquement ce fallback JSON.

Variables frontend (`frontend/.env`, optionnel) :

```env
VITE_API_URL=http://localhost:5000/api
```

En production, `VITE_API_URL` vaut `/api` (proxifie par le nginx du conteneur).

## Deploiement automatique sur le VPS

Domaine cible : **https://wikisguessr.azim404.com**

### 1. Secrets et variables GitHub a configurer (repo settings)

Secrets :

- `VPS_HOST` : IP/host du VPS
- `VPS_PORT` : port SSH
- `VPS_USER` : utilisateur SSH (ex. `debian`)
- `VPS_SSH_KEY` : cle privee ed25519 **encodee en base64** (`base64 -w0 ~/.ssh/wikisguessr_deploy`)

Variables :

- `VPS_APP_DIR` = `/home/debian/apps/wikisguessr`
- `VPS_COMPOSE_PROJECT` = `wikisguessr`

### 2. Preparer le VPS (one-shot)

```bash
ssh azim-vps
sudo mkdir -p /home/debian/apps/wikisguessr
sudo chown debian:debian /home/debian/apps/wikisguessr
cd /home/debian/apps/wikisguessr

# Cloner manuellement la 1ere fois (le workflow le fait aussi si le dossier est vide)
git clone https://github.com/<owner>/wikisguessr.git .

# Creer le fichier .env (jamais commit)
cp .env.example .env
nano .env   # renseigner mots de passe DB, JWT_SECRET, Brevo, etc.
```

### 3. Reverse proxy public + TLS

```bash
sudo cp deploy/nginx/wikisguessr.azim404.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/wikisguessr.azim404.com.conf /etc/nginx/sites-enabled/
sudo nginx -t

# Premier certificat (la conf SSL est referencee, donc commenter temporairement
# le bloc 443 puis recharger nginx avant certbot ; ou utiliser --redirect)
sudo certbot --nginx -d wikisguessr.azim404.com
sudo systemctl reload nginx
```

DNS : creer un enregistrement A `wikisguessr.azim404.com` -> IP du VPS avant certbot.

### 4. Deploiement

Push sur `main` declenche `.github/workflows/deploy-vps.yml` :

1. SSH sur le VPS
2. `git fetch && git reset --hard origin/main && git clean -fd` (preserve `.env`)
3. `docker compose -p wikisguessr up -d --build --remove-orphans`
4. `docker image prune -f`

Verifications :

```bash
ssh azim-vps "cd /home/debian/apps/wikisguessr && docker compose -p wikisguessr ps"
curl -I https://wikisguessr.azim404.com
```

### 5. Architecture des conteneurs

| Service | Conteneur            | Image            | Port                      |
| ------- | -------------------- | ---------------- | ------------------------- |
| `db`    | wikisguessr-db       | mysql:8          | interne uniquement        |
| `api`   | wikisguessr-api      | build backend    | interne uniquement (5000) |
| `app`   | wikisguessr-app      | build frontend   | 127.0.0.1:3009 -> 80      |

Le conteneur `app` (nginx) sert le build Vite et proxifie `/api/*` vers `api:5000`. Le nginx hote proxifie HTTPS vers `127.0.0.1:3009`.

### 6. Donnees persistantes

- Volume Docker `dbdata` : donnees MySQL
- Schema initial : `backend/schema.sql` monte sur `/docker-entrypoint-initdb.d` (joue uniquement au premier boot)

### 7. Mise a jour du schema SQL

Pour les migrations apres le 1er deploy, executer manuellement les scripts dans le conteneur DB :

```bash
ssh azim-vps "docker exec -i wikisguessr-db mysql -u root -p\$DB_ROOT_PASSWORD wikisguessr" < migration.sql
```
