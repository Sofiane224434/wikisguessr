# Cours Conception - Starter Kit (Public)

But du document:
- Expliquer clairement, etape par etape, comment publier un projet sur VPS.
- Le faire marcher sous un sous-domaine.
- Automatiser les deploiements avec GitHub Actions.
- Utiliser Docker sans melanger les projets entre eux.

Architecture cible (anonymisee, basee sur ta config type):
- Reverse proxy: Nginx installe sur le serveur
- SSL: Certbot sur l hote
- Apps: une stack Docker Compose par projet
- Exposition app: uniquement en localhost (127.0.0.1)

## 0) Fiche variables a remplir (obligatoire)

Remplis ce tableau avant de commencer.

- PROJECT_NAME: nom court du projet (ex: blog)
- REPO_OWNER: owner GitHub (user ou org)
- REPO_NAME: nom du repo GitHub
- BRANCH: branche de deploy (souvent main)
- DOMAIN: sous-domaine complet (ex: blog.votre-domaine.com)
- VPS_HOST: IP ou hostname du serveur
- VPS_PORT: port SSH (ex: 22 ou 2222)
- VPS_USER: utilisateur SSH de deploy (non-root)
- VPS_BASE_DIR: racine apps sur le serveur (ex: /home/deploy/apps)
- APP_DIR: dossier du projet sur le VPS (ex: /home/deploy/apps/blog)
- APP_LOCAL_PORT: port local expose par l app (ex: 3001)
- APP_CONTAINER_PORT: port interne conteneur (souvent 80)

Formules utiles:
- APP_DIR = VPS_BASE_DIR/PROJECT_NAME
- docker-compose ports = 127.0.0.1:APP_LOCAL_PORT:APP_CONTAINER_PORT

## 1) Ou mettre chaque fichier

Dans ton repo projet:
- Dockerfile: a la racine du repo
- docker-compose.yml: a la racine du repo
- .github/workflows/deploy.yml: workflow de deploiement auto
- .env.example: template des variables d app (jamais de vraies cles)

Sur le VPS:
- Code du projet: APP_DIR
- Vhost Nginx: /etc/nginx/sites-available/PROJECT_NAME
- Lien actif Nginx: /etc/nginx/sites-enabled/PROJECT_NAME

Dans GitHub (repo settings):
- Secrets Actions: VPS_HOST, VPS_USERNAME, VPS_PORT, VPS_SSH_KEY

## 2) Etape A - Dockeriser le projet

2.1 Creer Dockerfile (racine repo)

Exemple frontend statique:

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

2.2 Creer docker-compose.yml (racine repo)

services:
	app:
		build: .
		container_name: PROJECT_NAME-app
		restart: unless-stopped
		ports:
			- "127.0.0.1:APP_LOCAL_PORT:APP_CONTAINER_PORT"

Ce que tu dois changer:
- PROJECT_NAME-app
- APP_LOCAL_PORT
- APP_CONTAINER_PORT

## 3) Etape B - Premier lancement manuel sur VPS

3.1 Se connecter SSH

ssh -p VPS_PORT VPS_USER@VPS_HOST

3.2 Creer le dossier projet

mkdir -p APP_DIR
cd APP_DIR

3.3 Cloner puis lancer

git clone https://github.com/REPO_OWNER/REPO_NAME.git .
docker compose up -d --build
docker compose ps

3.4 Tester localement sur le VPS

curl -I http://127.0.0.1:APP_LOCAL_PORT

Si ce test echoue, ne passe pas a l etape suivante.

## 4) Etape C - Configurer le sous-domaine DNS

Chez le fournisseur DNS:
1. Ajouter un enregistrement A
2. Nom: PROJECT_NAME (ou sous-domaine choisi)
3. Cible: VPS_HOST
4. TTL: 300 ou 600

Exemple resultat attendu:
- DOMAIN -> VPS_HOST

## 5) Etape D - Configurer Nginx (hote)

5.1 Creer le fichier:
- /etc/nginx/sites-available/PROJECT_NAME

5.2 Mettre cette config (adapte DOMAIN et APP_LOCAL_PORT)

server {
	listen 80;
	server_name DOMAIN;

	location / {
		proxy_pass http://127.0.0.1:APP_LOCAL_PORT;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}

5.3 Activer puis recharger Nginx

sudo ln -s /etc/nginx/sites-available/PROJECT_NAME /etc/nginx/sites-enabled/PROJECT_NAME
sudo nginx -t
sudo systemctl reload nginx

## 6) Etape E - Activer HTTPS (Certbot)

sudo certbot --nginx -d DOMAIN

Test:

curl -I https://DOMAIN

## 7) Etape F - Activer le deploy auto GitHub Actions

7.1 Ajouter les secrets GitHub (Repo -> Settings -> Secrets and variables -> Actions)

- VPS_HOST: IP/hostname du VPS
- VPS_USERNAME: user SSH
- VPS_PORT: port SSH
- VPS_SSH_KEY: cle privee SSH de deploy

7.2 Creer .github/workflows/deploy.yml

name: Deploy PROJECT_NAME

on:
	push:
		branches: [BRANCH]

jobs:
	deploy:
		runs-on: ubuntu-latest
		steps:
			- name: Checkout
				uses: actions/checkout@v4

			- name: Deploy via SSH
				uses: appleboy/ssh-action@v1.0.3
				with:
					host: ${{ secrets.VPS_HOST }}
					username: ${{ secrets.VPS_USERNAME }}
					key: ${{ secrets.VPS_SSH_KEY }}
					port: ${{ secrets.VPS_PORT }}
					script: |
						set -e
						APP_DIR=APP_DIR
						REPO_URL=https://github.com/${{ github.repository }}.git

						mkdir -p $APP_DIR
						cd $APP_DIR

						if [ -d ".git" ]; then
							git fetch origin
							git reset --hard origin/BRANCH
							git clean -fd
						else
							git init
							git remote add origin $REPO_URL
							git fetch origin BRANCH
							git checkout -B BRANCH origin/BRANCH
						fi

						docker compose down || true
						docker compose up -d --build
						docker compose ps

Ce que tu dois changer dans ce workflow:
- PROJECT_NAME
- BRANCH
- APP_DIR

## 8) Etape G - Test de bout en bout

1. Faire un commit + push sur BRANCH
2. Ouvrir GitHub Actions et verifier le job deploy
3. Sur VPS verifier:

cd APP_DIR
git rev-parse --short HEAD
docker compose ps
docker compose logs --tail=100

4. Depuis ton poste:

curl -I https://DOMAIN

## 9) Variables: ou les mettre exactement

Dans docker-compose.yml:
- APP_LOCAL_PORT
- APP_CONTAINER_PORT

Dans Nginx:
- DOMAIN
- APP_LOCAL_PORT

Dans workflow deploy.yml:
- BRANCH
- APP_DIR

Dans GitHub Secrets:
- VPS_HOST
- VPS_USERNAME
- VPS_PORT
- VPS_SSH_KEY

Dans .env / .env.example du projet (si necessaire):
- Variables applicatives (API keys, endpoints)
- Jamais de valeur reelle dans .env.example

## 10) Mode multi-projets sans casse

Pour chaque nouveau projet:
1. Nouveau sous-domaine
2. Nouveau APP_LOCAL_PORT (3001, 3002, 3003...)
3. Nouveau dossier APP_DIR
4. Nouveau workflow dans son repo
5. Nouveau vhost Nginx

Regle d or:
- Un projet = un dossier VPS = un vhost Nginx = un workflow GitHub Actions.


