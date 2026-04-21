# 🚀 Starter Kit — Application Fullstack

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-5-lightgrey)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Starter kit moderne pour développer rapidement des applications web fullstack avec authentification JWT, i18n FR/EN, email transactionnel via Brevo, et traduction automatique DeepL. Le branding frontend est personnalise pour Azim404 (footer + lien externe).

## 📑 Table des Matières

- [Démarrage Rapide](#-démarrage-rapide)
- [Fonctionnalités](#-fonctionnalités)
- [Technologies](#-technologies)
- [Architecture](#️-architecture)
- [Backend](#-backend)
- [Frontend](#-frontend)
- [i18n — Traductions](#-i18n--traductions-automatiques)
- [Email (Brevo)](#-email-transactionnel-brevo)
- [Authentification](#-authentification)
- [API Endpoints](#-api-endpoints)
- [Scripts](#️-scripts-disponibles)

---

## 🚀 Démarrage Rapide

### Prérequis

- Node.js 22+
- MySQL 8+

### Installation

```bash
# Installer les dépendances
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Configurer les variables d'environnement
cp backend/.env.example backend/.env
# Remplir backend/.env avec vos clés (DB, JWT, Brevo, DeepL)

# Initialiser la base de données (PowerShell)
Get-Content backend/schema.sql | mysql -u root

# Lancer backend + frontend + watch DeepL
npm run dev

# Variante sans DeepL (si DEEPL_API_KEY absente/invalide)
npm run dev:backend
npm run dev:frontend
```

- **Backend** : http://localhost:5000
- **Frontend** : http://localhost:5173

---

## ✨ Fonctionnalités

- ✅ Authentification JWT (inscription, connexion, routes protégées)
- ✅ Hashage sécurisé des mots de passe avec bcrypt
- ✅ Validation partagée frontend/backend avec **Zod**
- ✅ Architecture MVC backend (ES Modules)
- ✅ Routing React avec layout principal `MainLayout`
- ✅ **Internationalisation (i18n)** FR/EN avec i18next + chargement HTTP
- ✅ **Traduction automatique** FR → EN via DeepL (incrémentale + mode watch)
- ✅ **Email transactionnel** via Brevo (API backend)
- ✅ Tailwind CSS v4

---

## 🛠️ Technologies

<!-- AUTO:technologies -->
**Backend**

| Technologie | Version |
|-------------|----------|
| Node.js | 22+ |
| express | 5.2.1 |
| mysql2 | 3.16.3 |
| jsonwebtoken | 9.0.3 |
| bcrypt | 6.0.0 |
| zod | 4.3.6 |
| @getbrevo/brevo | 5.0.1 |

**Frontend**

| Technologie | Version |
|-------------|----------|
| react | 19.2.0 |
| vite | 7.3.1 |
| tailwindcss | 4.1.18 |
| react-router-dom | 7.13.0 |
| i18next | 25.8.18 |
| zod | 4.3.6 |

**Outils Racine**

| Outil | Version |
|-------|----------|
| concurrently | 9.2.1 |
| deepl-node | 1.24.0 |
<!-- /AUTO:technologies -->

---

## 🏗️ Architecture

<!-- AUTO:structure -->
```
starter-kit/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── email.controller.js
│   ├── middlewares/
│   │   └── auth.middleware.js
│   ├── models/
│   │   └── user.model.js
│   ├── package-lock.json
│   ├── package.json
│   ├── routes/
│   │   ├── auth.routes.js
│   │   └── email.routes.js
│   ├── schema.sql
│   ├── server.js
│   └── services/
│       └── email.service.js
├── frontend/
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── public/
│   │   ├── assets/
│   │   └── locales/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── assets/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── index.css
│   │   ├── layouts/
│   │   ├── main.jsx
│   │   ├── pages/
│   │   └── services/
│   └── vite.config.js
├── GUIDE_VITEST.md
├── package-lock.json
├── package.json
├── README.md
├── scripts/
│   ├── readme.js
│   └── translate.js
└── shared/
    └── schemas.js
```
<!-- /AUTO:structure -->

---

## 🔧 Backend

### Structure

```
backend/
├── config/db.js                 # Pool de connexions MySQL
├── controllers/
│   ├── auth.controller.js       # Inscription / Connexion / Profil
│   └── email.controller.js      # Envoi d'email (validation Zod)
├── middlewares/auth.middleware.js  # Vérification JWT
├── models/user.model.js
├── routes/
│   ├── auth.routes.js
│   └── email.routes.js
├── services/email.service.js    # sendCustomEmail via Brevo
├── schema.sql                   # Schéma MySQL (table users)
└── server.js
```

### Variables d'Environnement

Créer `backend/.env` :

```env
PORT=5000
NODE_ENV=development
APP_URL=http://localhost:5173

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=starter_kit

JWT_SECRET=votre_secret_jwt
JWT_EXPIRES_IN=7d

BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=votre@email.com
BREVO_SENDER_NAME=Votre Nom

DEEPL_API_KEY=votre-cle:fx
```

---

## 🎨 Frontend

### Structure

```
frontend/src/
├── App.jsx
├── components/
│   ├── Header.jsx              # Header simplifie + selecteur FR/EN
│   └── Footer.jsx              # Footer avec lien Azim404.com
├── layouts/
│   └── MainLayout.jsx          # Layout principal
├── layouts/AuthLayout.jsx
├── pages/
│   └── Home.jsx
├── services/api.js             # Client HTTP (fetch)
├── i18n.js
└── main.jsx
```

Fichiers de traduction : `frontend/public/locales/{fr,en}/translation.json`

---

## 🌐 i18n — Traductions Automatiques

Les traductions sont chargées depuis `public/locales/` via HTTP. La langue est détectée depuis le navigateur (fallback : FR).

### Ajouter une clé

1. Ajouter dans `frontend/public/locales/fr/translation.json`
2. Le mode watch traduit automatiquement vers EN via DeepL

```json
{ "ma_page": { "titre": "Mon titre", "texte": "Avec {{variable}}" } }
```

### Cache incrémental

`scripts/.translate-cache.json` stocke l'état précédent du FR. Seules les clés **modifiées ou absentes de la cible** sont envoyées à DeepL.

> Pour corriger une traduction : éditer `en/translation.json` directement. La correction est **préservée** tant que la clé FR ne change pas.

---

## 📧 Email Transactionnel (Brevo)

L'endpoint backend `/api/email/send` permet d'envoyer un email transactionnel via Brevo.

### Réutiliser `sendCustomEmail`

```js
import { sendCustomEmail } from '../services/email.service.js';

await sendCustomEmail({
  to: 'destinataire@example.com',
  name: 'Prénom Nom',   // optionnel
  subject: 'Sujet',
  message: 'Corps du message',
});
```

---

## 🔐 Authentification

**Flow :** `POST /register` ou `/login` → JWT retourné → stocké en `localStorage` → joint dans `Authorization: Bearer <token>` sur chaque requête protégée.

| Mesure | Description |
|--------|-------------|
| bcrypt (cost 10) | Mots de passe jamais stockés en clair |
| JWT signé | Secret configurable, expiration paramétrable |
| CORS strict | Seul `http://localhost:5173` autorisé en dev |
| Validation Zod | Données validées côté serveur sur chaque route |

---

## 📡 API Endpoints

### Auth

| Méthode | Endpoint | Protection | Body |
|---------|----------|------------|------|
| POST | `/api/auth/register` | Public | `{ email, password, firstname?, lastname? }` |
| POST | `/api/auth/login` | Public | `{ email, password }` |
| GET | `/api/auth/me` | 🔒 JWT | — |

### Email

| Méthode | Endpoint | Protection | Body |
|---------|----------|------------|------|
| POST | `/api/email/send` | 🔒 JWT | `{ to, subject, message, name? }` |

---

## 🛠️ Scripts Disponibles

### Racine

| Commande | Rôle |
|----------|------|
| `npm run dev` | `concurrently "npm run dev:backend" "npm run dev:frontend" "npm run translate:watch"` |
| `npm run dev:backend` | `cd backend && npm run dev` |
| `npm run dev:frontend` | `cd frontend && npm run dev` |
| `npm run translate` | `node scripts/translate.js` |
| `npm run translate:watch` | `node scripts/translate.js --watch` |

### Backend (`cd backend`)

| Commande | Rôle |
|----------|------|
| `npm run start` | `node server.js` |
| `npm run dev` | `node --watch server.js` |

### Frontend (`cd frontend`)

| Commande | Rôle |
|----------|------|
| `npm run dev` | `vite` |
| `npm run build` | `vite build` |
| `npm run lint` | `eslint .` |
| `npm run preview` | `vite preview` |

---

## 📦 Shared — Validation Zod

```
shared/schemas.js   # Schémas Zod partagés frontend + backend
```

```js
// Backend
import { loginSchema } from '../../shared/schemas.js';

// Frontend
import { loginSchema } from '../../../shared/schemas.js';
```
