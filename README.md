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
```

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
