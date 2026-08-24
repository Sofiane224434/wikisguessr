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
APP_URL=http://localhost:5173
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SILVER_PRICE_ID=price_...
STRIPE_GOLD_PRICE_ID=price_...
```

Paiements Stripe :

- Creer dans Stripe deux prix recurrents mensuels : Silver a 2,50 EUR et Gold a 5,00 EUR, puis renseigner leurs IDs `price_...`.
- Activer et configurer le portail client Stripe afin que les joueurs puissent modifier ou resilier leur abonnement.
- En local, lancer `stripe listen --forward-to localhost:5000/api/subscriptions/webhook` et copier le secret `whsec_...` affiche dans `backend/.env`.
- Dans Stripe, enregistrer en production le webhook `https://wikisguessr.azim404.com/api/subscriptions/webhook` pour les evenements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` et `customer.subscription.deleted`.
- Appliquer la migration avec `npm run migrate:payments --prefix backend` en local. Sur une base deja deployee, appliquer `backend/migrations/20260823_add_stripe_payments.sql` avant de redemarrer l'API.
- Tester la synchronisation signee avec `npm run test:payments --prefix backend`.

L'abonnement n'est jamais active depuis le navigateur : seul le webhook Stripe signe met a jour les droits en base. Les donnees bancaires restent hebergees par Stripe Checkout.

Photos de profil :

- Appliquer `npm run migrate:avatars --prefix backend` sur une base locale existante.
- Les images JPEG, PNG ou WebP de 5 Mo maximum sont recadrees en 512 x 512 et converties en WebP par le backend.
- En production Docker, le volume `avatar_data` conserve les fichiers dans `/app/uploads` entre les deploiements.
- Le parcours complet peut etre teste avec `npm run test:avatars --prefix backend` pendant que l'API tourne sur le port 5000.

Quiz IA mode connaissance :

- Quand une partie `knowledge` est gagnee, le front appelle `POST /api/games/:code/knowledge-quiz`.
- Le backend envoie un seul prompt a Gemini avec les articles intermediaires visites et demande 5 QCM. Pour un parcours direct, les articles de depart et cible servent de contexte.
- Le quiz knowledge est strictement IA: si Gemini est indisponible (quota, API down, reponse invalide, config absente), l API retourne une erreur sans fallback local.
- Si aucun article du parcours ne fournit de contexte exploitable, l API repond en `400` avec un message explicite.
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
| `app`   | wikisguessr-app      | build frontend   | 127.0.0.1:3010 -> 80      |

Le conteneur `app` (nginx) sert le build Vite et proxifie `/api/*` vers `api:5000`. Le nginx hote proxifie HTTPS vers `127.0.0.1:3010`.

### 6. Donnees persistantes

- Volume Docker `dbdata` : donnees MySQL
- Schema initial : `backend/schema.sql` monte sur `/docker-entrypoint-initdb.d` (joue uniquement au premier boot)

### 7. Mise a jour du schema SQL

Pour les migrations apres le 1er deploy, executer manuellement les scripts dans le conteneur DB :

```bash
ssh azim-vps "docker exec -i wikisguessr-db mysql -u root -p\$DB_ROOT_PASSWORD wikisguessr" < migration.sql
```
