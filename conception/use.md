# Stack Technique & Dépendances - WikisGuessr

Document centralisé de toutes les dépendances, services et assets utilisés dans le projet.

---

## FRONTEND (React + Vite)

### Build & Framework
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **vite** | ^7.3.1 | Build tool moderne, HMR rapide, bundle léger | Build |
| **@vitejs/plugin-react** | ^5.1.1 | Support JSX + Fast Refresh pour React | Build |
| **react** | ^19.2.0 | Framework UI principal | Framework |
| **react-dom** | ^19.2.0 | Rendu React dans le DOM | Framework |
| **react-router-dom** | ^7.13.0 | Routing SPA (pages, navigation) | Framework |

### Styling & UI Components
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **tailwindcss** | ^4.1.18 | Utility-first CSS, rapid prototyping | Styling |
| **@tailwindcss/vite** | ^4.1.18 | Plugin Tailwind pour Vite | Styling |
| **papercss** | ^1.9.2 | Design "papier", aesthetic bibliothèque | Styling |
| **rough-notation** | ^0.5.1 | Animations texte & soulignements dessinés | UI Animation |
| **vivus** | ^0.4.6 | Animation SVG dessinées ligne-par-ligne | UI Animation |

### Internationalization (i18n)
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **i18next** | ^25.8.18 | Gestion des traductions multilingues | i18n |
| **react-i18next** | ^16.5.8 | Intégration i18next avec React | i18n |
| **i18next-browser-languagedetector** | ^8.2.1 | Détection auto de la langue du navigateur | i18n |
| **i18next-http-backend** | ^3.0.2 | Chargement JSON traductions depuis /public/locales | i18n |

### API & Data Fetching
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **axios** | ^1.14.0 | HTTP client pour appels API backend | HTTP |

### Forms & Validation
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **@hookform/resolvers** | ^5.2.2 | Validation schemas (Zod) intégrée dans react-hook-form | Form |
| **zod** | ^4.3.6 | Schéma validation typsafe, runtime checking | Validation |

### UI Components & Feedback
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **react-hot-toast** | ^2.6.0 | Notifications toast (success, error, info) | UI |
| **ldrs** | ^1.1.9 | Loaders/spinners animations CSS | UI |

### Dev Dependencies
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **jest** | ^30.3.0 | Test runner unit & component tests | Testing |
| **@testing-library/react** | ^16.3.2 | Utilités test pour composants React | Testing |
| **@testing-library/jest-dom** | ^6.9.1 | Matchers Jest pour DOM | Testing |
| **jest-environment-jsdom** | ^30.3.0 | Environnement jsdom pour Jest | Testing |
| **babel-jest** | ^30.3.0 | Transpilation ES6+ pour Jest | Testing |
| **eslint** | ^9.39.1 | Linter JavaScript/React | Linting |
| **@eslint/js** | ^9.39.1 | Config ESLint officielle | Linting |
| **eslint-plugin-react-hooks** | ^7.0.1 | Rules hooks React (deps, cleanup) | Linting |
| **eslint-plugin-react-refresh** | ^0.4.24 | Rules React Fast Refresh | Linting |
| **vite-plugin-svgr** | ^4.5.0 | Importer SVG comme composants React | Build |

### Frontend Assets Structure
```
frontend/public/
├── assets/
│   ├── icons/               # Icônes SVG (menu, setting, user, etc.)
│   └── img/                 # Images PNG/JPG (logo, backgrounds)
├── locales/                 # Traductions JSON (10 langues)
│   ├── ar/translation.json
│   ├── de/translation.json
│   ├── en/translation.json
│   ├── es/translation.json
│   ├── fr/translation.json
│   ├── hi/translation.json
│   ├── ja/translation.json
│   ├── pt/translation.json
│   ├── ru/translation.json
│   └── zh/translation.json
└── index.html               # Entry point HTML

frontend/src/
├── assets/
│   └── icons/               # Icônes React/SVG importés comme composants
└── components/
    ├── ui/
    │   ├── LanguageSelect.jsx
    │   └── WikisGuessrLogo.jsx
    ├── layouts/
    │   ├── Header.jsx
    │   ├── Footer.jsx
    │   └── SideColumn.jsx
```

---

## BACKEND (Node.js + Express)

### Server & Framework
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **express** | ^5.2.1 | Framework HTTP/REST API | Framework |
| **cors** | ^2.8.6 | Gestion CORS (accès frontend → backend) | Middleware |
| **dotenv** | ^17.2.4 | Chargement variables env depuis .env | Config |

### Authentication & Security
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **jsonwebtoken** | ^9.0.3 | Génération/validation JWT pour auth | Auth |
| **bcrypt** | ^6.0.0 | Hashing sécurisé des mots de passe | Auth |

### Database
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **mysql2** | ^3.16.3 | Driver MySQL avec pool connections & promises | Database |

### Email Service
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **@getbrevo/brevo** | ^5.0.1 | Service email transactionnel (ex: confirmation signup) | Email |

### Validation
| Package | Version | Raison | Catégorie |
|---------|---------|--------|-----------|
| **zod** | ^4.3.6 | Schéma validation (partagé frontend) | Validation |

### Backend Structure
```
backend/
├── server.js                # Entry point Express
├── src/
│   ├── config/
│   │   └── db.js            # Pool MySQL config
│   ├── controllers/         # Route handlers
│   │   ├── auth.controller.js
│   │   └── email.controller.js
│   ├── routes/              # Route definitions
│   │   ├── auth.routes.js
│   │   └── email.routes.js
│   ├── middlewares/         # Custom middlewares
│   │   └── auth.middleware.js
│   ├── models/              # Database models
│   │   └── user.model.js
│   └── services/            # Business logic
│       └── email.service.js
├── uploads/                 # Avatar uploads (future)
└── schema.sql               # SQL initial schema
```

---

## SERVICES EXTERNES

### Paiement
| Service | Raison | Documentation |
|---------|--------|---------------|
| **Stripe** | Gestion abonnements 4,99€/mois, webhooks paiement, renouvellement auto | https://stripe.com/docs |

### Authentication / OAuth
| Service | Raison | Configuration |
|---------|--------|---------------|
| **Google OAuth 2.0** | Sign-in rapide avec compte Google | Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| **GitHub OAuth 2.0** | Sign-in rapide avec compte GitHub | Secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET |

### Données / API Externe
| Service | Raison | Utilisation |
|---------|--------|-------------|
| **MediaWiki API** | Récupérer pages Wikipedia, liens internes | `/w/api.php?action=query&titles=...` |
| **Wikidata API** | Extraction faits bruts (dates, noms, lieux) pour quiz | `/w/api.php` (Wikidata queries) |

### Infrastructure
| Service | Raison | Configuration |
|---------|--------|---------------|
| **Docker** | Containerisation services (mysql, node, nginx) | `docker-compose.yml` |
| **Nginx** | Reverse proxy HTTPS, static file serve (frontend) | `/etc/nginx/sites-available/wikisguessr.azim404.com` |
| **Certbot / Let's Encrypt** | SSL certificate TLS (https://wikisguessr.azim404.com) | Auto-renew configuré |
| **GitHub Actions** | CI/CD deployment automatique sur main push | `.github/workflows/deploy-vps.yml` |

### Email (Optional for Future)
| Service | Raison | Configuration |
|---------|--------|---------------|
| **Brevo (ex-Sendinblue)** | Service email transactionnel | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` |

---

## POLICES D'ÉCRITURE (Google Fonts)

### Titres & Headings
- **Cinzel** (serif, élégant, romain)
  - Usage: H1, H2, titres sections, lobby titre
  - Google Fonts: https://fonts.google.com/specimen/Cinzel

### Corps de texte
- **Romanesco** (serif, readable, bibliothèque)
  - Usage: Paragraphes, descriptions, chat messages
  - Google Fonts: https://fonts.google.com/specimen/Romanesco

### Accents & Premières lettres
- **Gideon Roman** (serif ornementale, style journal ancien)
  - Usage: Drop caps, premières lettres paragraphes importants
  - Google Fonts: https://fonts.google.com/specimen/Gideon+Roman

---

## VARIABLES D'ENVIRONNEMENT

### Backend (.env)
```
# Database
DB_HOST=db
DB_PORT=3306
DB_NAME=wikisguessr
DB_USER=wikisguessr_user
DB_PASSWORD=<random>
DB_ROOT_PASSWORD=<random>

# Server
PORT=5000
NODE_ENV=production

# Authentication
JWT_SECRET=<random_32_chars>

# CORS
CORS_ORIGIN=https://wikisguessr.azim404.com

# Email (Brevo)
BREVO_API_KEY=<key>
BREVO_SENDER_EMAIL=noreply@wikisguessr.azim404.com
BREVO_SENDER_NAME=WikisGuessr

# OAuth (future)
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
GITHUB_CLIENT_ID=<id>
GITHUB_CLIENT_SECRET=<secret>

# Stripe (future)
STRIPE_SECRET_KEY=<key>
STRIPE_PUBLISHABLE_KEY=<key>
STRIPE_WEBHOOK_SECRET=<secret>
```

### Frontend (.env)
```
VITE_API_URL=https://wikisguessr.azim404.com/api
```

---

## RÉSUMÉ STACK

- **Frontend**: React 19 + Vite + Tailwind + i18next (10 langues)
- **Backend**: Node.js + Express 5 + MySQL 8 + JWT
- **Real-time**: Socket.io (à ajouter pour multiplayer)
- **Styling**: Tailwind + PaperCSS + Rough Notation
- **Payment**: Stripe
- **Email**: Brevo (optional)
- **Auth**: JWT + OAuth (Google, GitHub)
- **Deployment**: Docker + GitHub Actions + Certbot
- **Hosting**: VPS OVH (51.210.244.46, port 2222 SSH)

---

## COMMANDES UTILES

```bash
# Frontend
npm run dev              # Start Vite dev server
npm run build           # Build production
npm run lint            # ESLint check
npm test                # Jest unit tests

# Backend  
npm start               # Run production server
npm run dev             # Run avec --watch auto-reload
npm test                # (à configurer)

# Docker
docker compose up -d --build    # Build + start services
docker compose ps               # Check status
docker compose logs -f          # Follow logs
docker compose down             # Stop all services

# Git
git fetch origin main
git reset --hard origin/main
git clean -fd -e .env           # Clean, preserve .env
```