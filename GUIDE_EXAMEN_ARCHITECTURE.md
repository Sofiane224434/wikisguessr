# 📚 GUIDE COMPLET DE RÉVISION & ARCHITECTURE DU PROJET WIKISGUESSR

Ce guide recense **l'intégralité des fonctionnalités, fonctions, contrôleurs, modèles, services et composants** du projet **WikisGuessr**. Il est spécialement structuré pour répondre aux questions d'examen du type :
- *« Où se trouve telle fonction ? »*
- *« Où est implémentée telle fonctionnalité ? »*
- *« Dans quels fichiers cette fonction/variable est-elle utilisée et comment ? »*

---

## 🧭 TABLE DES MATIÈRES RAPIDE
1. [Architecture Globale & Stack Technique](#1-architecture-globale--stack-technique)
2. [Authentification, Utilisateurs & Sécurité](#2-authentification-utilisateurs--sécurité)
3. [Matchmaking & Multijoueur en Temps Réel (Socket.IO)](#3-matchmaking--multijoueur-en-temps-réel-socketio)
4. [Moteur de Jeu & Gestion des Articles Wikipédia](#4-moteur-de-jeu--gestion-des-articles-wikipédia)
5. [Modes de Jeu (Normal, Chrono, Connaissance/Quiz, Aperçu)](#5-modes-de-jeu)
6. [Calcul des Scores & Système de Classement Elo](#6-calcul-des-scores--système-de-classement-elo)
7. [Boutique, Abonnements & Paiements Stripe](#7-boutique-abonnements--paiements-stripe)
8. [Profil, Historique & Statistiques](#8-profil-historique--statistiques)
9. [Administration, Modération & Maintenance](#9-administration-modération--maintenance)
10. [Système de Signalements (Reports)](#10-système-de-signalements-reports)
11. [Internationalisation (i18n) & Traduction](#11-internationalisation-i18n--traduction)
12. [Foire Aux Questions Spécial Examen (Où se trouve X ?)](#12-foire-aux-questions-spécial-examen)

---

## 1. ARCHITECTURE GLOBALE & STACK TECHNIQUE

### Backend (`/backend`)
- **Runtime** : Node.js (ES Modules `"type": "module"`)
- **Framework Web** : Express.js
- **Base de Données** : PostgreSQL (avec client `pg` via pool de connexions)
- **Temps Réel** : Socket.IO (serveur attaché à HTTP Express)
- **Sécurité** : JWT (JSON Web Tokens), `bcrypt` / hashing, `cors`, `helmet`, `express-rate-limit`
- **Paiements** : Stripe SDK (`stripe`)
- **Tests** : Node Test Runner natif (`node --test test/*.test.js`)

### Frontend (`/frontend`)
- **Framework** : React 19 (Vite)
- **Routage** : React Router DOM v7
- **Style** : Tailwind CSS v4 & styles utilitaires personnalisés (`index.css`)
- **Temps Réel** : `socket.io-client`
- **Requêtes API** : `axios` (instance configurée dans `src/services/api.js`)
- **Gestion des Formulaires** : `react-hook-form` + `zod`
- **Internationalisation** : `i18next` + `react-i18next`
- **Icônes** : `lucide-react`
- **Assainissement HTML** : `dompurify`

---

## 2. AUTHENTIFICATION, UTILISATEURS & SÉCURITÉ

| Fonctionnalité | Backend (Fichiers & Fonctions) | Frontend (Fichiers & Composants) |
| :--- | :--- | :--- |
| **Inscription (Register)** | • `backend/src/controllers/auth.controller.js` : `register()`<br>• `backend/src/models/user.model.js` : `createUser()`, `findUserByEmail()`, `findUserByUsername()`<br>• Route : `POST /api/auth/register` | • `frontend/src/pages/Login.jsx` (Mode inscription)<br>• `frontend/src/services/api.js` : `authService.register()` |
| **Connexion (Login)** | • `backend/src/controllers/auth.controller.js` : `login()`<br>• Vérification mot de passe : `bcrypt.compare()`<br>• Génération token JWT : `generateToken(user)`<br>• Route : `POST /api/auth/login` | • `frontend/src/pages/Login.jsx`<br>• `frontend/src/context/Authcontext.jsx` : `login()`<br>• Stockage du token dans `localStorage` |
| **Vérification Email** | • `backend/src/controllers/email.controller.js` : `verifyEmail()`<br>• `backend/src/services/email.service.js` : `sendVerificationEmail()`<br>• Route : `POST /api/email/verify` | • `frontend/src/pages/VerifyEmail.jsx`<br>• `frontend/src/services/api.js` : `emailService.verify()` |
| **Mot de Passe Oublié & Reset** | • `backend/src/controllers/auth.controller.js` : `forgotPassword()`, `resetPassword()`<br>• `backend/src/services/email.service.js` : `sendPasswordResetEmail()` | • `frontend/src/pages/Login.jsx` (Vues forgot/reset) |
| **Middleware de Sécurité (Auth)** | • `backend/src/middlewares/auth.middleware.js` : `requireAuth()`, `requireAdmin()`<br>• Vérifie `Authorization: Bearer <token>` | • `frontend/src/services/api.js` : Intercepteur Axios injectant le header `Authorization` |
| **Suppression de Compte** | • `backend/src/controllers/auth.controller.js` : `deleteAccount()`<br>• `backend/src/models/user.model.js` : `deleteUser()`<br>• Route : `DELETE /api/auth/account` | • `frontend/src/pages/Profile.jsx` : `handleDeleteAccount()`<br>• `frontend/src/services/api.js` : `authService.deleteAccount()` |
| **Modification Profil (Pseudo, Avatar, Mdp)** | • `backend/src/controllers/auth.controller.js` : `updateProfile()`, `changePassword()`<br>• `backend/src/models/user.model.js` : `updateUser()` | • `frontend/src/pages/Profile.jsx`<br>• `frontend/src/services/api.js` : `authService.updateProfile()` |

---

## 3. MATCHMAKING & MULTIJOUEUR EN TEMPS RÉEL (SOCKET.IO)

| Élément | Emplacement Backend | Emplacement Frontend | Description & Utilisation |
| :--- | :--- | :--- | :--- |
| **Moteur Socket.IO** | `backend/src/socket.js` | `frontend/src/pages/Game.jsx`, `frontend/src/pages/Lobby.jsx` | Initialise le serveur WebSocket et gère les événements temps réel (`join_game`, `player_progress`, `player_finish`, `room_message`). |
| **Service de Matchmaking** | `backend/src/services/matchmaking.service.js` :<br>• `joinQueue(player)`<br>• `leaveQueue(userId)`<br>• `findMatch(mode, lang)`<br>• `scheduleSoloFallback()` | `frontend/src/components/ui/MatchmakingUI.jsx`<br>`frontend/src/pages/Lobby.jsx` | File d'attente par mode de jeu (`normal`, `chrono`, `knowledge`) et par langue. Regroupe jusqu'à 8 joueurs ou bascule en solo après délai. |
| **Routes Matchmaking** | `backend/src/routes/matchmaking.routes.js`<br>• `POST /api/matchmaking/join`<br>• `POST /api/matchmaking/leave` | `frontend/src/services/api.js` : `matchmakingService.join()`, `leave()` | Points d'entrée REST pour entrer ou quitter la file d'attente multijoueur. |
| **Simulateur de Bots** | `backend/src/services/bot-simulator.service.js`<br>• `generateBots(count)`<br>• `simulateBotProgression()` | `frontend/src/pages/Game.jsx` (`ensureEightParticipantsWithBots`) | Génère des adversaires virtuels réalistes (avec pseudos, avatars, clics et temps) pour compléter les sessions à 8 participants. |
| **Salons Privés (Game Rooms)** | `backend/src/controllers/game-room.controller.js`<br>`backend/src/models/game-room.model.js` | `frontend/src/pages/Lobby.jsx` | Création de salon avec code unique, invitation d'amis, choix du mode et lancement groupé. |
| **Messagerie de Salon (Chat)** | `backend/src/controllers/room-message.controller.js`<br>`backend/src/models/room-message.model.js` | `frontend/src/pages/Lobby.jsx` | Envoi et réception de messages dans le chat du salon via Socket.IO. |

---

## 4. MOTEUR DE JEU & GESTION DES ARTICLES WIKIPÉDIA

| Fonctionnalité | Fichier & Fonction Clé | Description |
| :--- | :--- | :--- |
| **Récupération d'Articles Wikipédia** | `backend/src/controllers/wiki.controller.js` :<br>• `getArticleContent()`<br>• `getRandomPair()` | Interroge l'API officielle Wikipédia (`https://<lang>.wikipedia.org/w/api.php`) pour extraire le contenu HTML brut d'une page. |
| **Paires d'Articles Recommandées / Valides** | `backend/src/controllers/wiki.controller.js` :<br>• `getOfficialPairs()`<br>• `validateArticle()` | Garantit que l'article de départ et l'article cible sont reliables et adaptés au jeu. |
| **Assainissement HTML & Liens Internes** | • Backend : `wiki.controller.js` (`cleanWikiHtml`)<br>• Frontend : `frontend/src/pages/Game.jsx` (`DOMPurify.sanitize`) | Supprime les scripts, les boîtes de navigation inutiles, les références externes et réécrit les liens `<a>` pour qu'ils déclenchent la navigation in-game. |
| **Anti-Triche Moteur de Jeu** | • Frontend : `frontend/src/pages/Game.jsx` :<br>  - Interdiction de la recherche manuelle<br>  - Détection de focus et validation des clics<br>• Backend : `wiki.controller.js` vérifie la cohérence du parcours. | Empêche l'accès direct aux URLs et force le joueur à naviguer exclusivement via les liens hypertextes. |
| **Mode Triche Administrateur** | • Backend : `backend/src/services/site-state.service.js` (`adminCheat`)<br>• Frontend : `frontend/src/pages/Game.jsx` (`handleAdminCheat`) | Accessible uniquement pour l'admin : bouton éclair ⚡ permettant d'arriver instantanément sur l'article cible pour tester la fin de partie. |

---

## 5. MODES DE JEU

| Mode de Jeu | Règles & Spécificités | Implémentation Principale |
| :--- | :--- | :--- |
| **1. Exploration Classique (`normal`)** | Relier deux articles avec le minimum de clics et de temps. | • `frontend/src/pages/Game.jsx`<br>• `backend/src/controllers/game.controller.js` |
| **2. Course contre la montre (`chrono`)** | 5 minutes chrono (`CHRONO_START_SECONDS = 300`). Le score décroît avec le temps restant. | • `frontend/src/pages/Game.jsx` : timer dégressif & `chronoScore`<br>• Points = score restant à l'arrivée. |
| **3. Défi Connaissance (`knowledge`)** | Parcours d'articles suivi d'un Quiz de 5 questions généré à partir des articles visités. | • `backend/src/services/knowledge-quiz.service.js` : `generateQuizFromArticles()`<br>• `frontend/src/pages/Game.jsx` : affichage du quiz, calcul du ratio (bonnes/mauvaises réponses). |
| **4. Mode Aperçu (`apercu`)** | Entraînement solo libre sans enregistrement Elo ni classement compétitif. | • `frontend/src/pages/Game.jsx` (flag `isPreviewMode`). |

---

## 6. CALCUL DES SCORES & SYSTÈME DE CLASSEMENT ELO

### Calcul des Points de Partie
- **Fichier** : `frontend/src/pages/Game.jsx` (`calculateGamePoints`)
- **Formules** :
  - **Normal** : `Score = max(10, 1000 - (clics - 1) * 35 - (secondes / 5) * 8)`
  - **Chrono** : `Score = chronoScore restant` (0 si temps écoulé)
  - **Knowledge** : `Score = 500 (victoire) + (bonnes_réponses * 100) + bonus_vitesse + bonus_clics`

### Algorithme Elo Multijoueur
- **Fichier Backend** : `backend/src/models/user.model.js` (`calculateMultiplayerEloDistribution`)
- **Fichier Tests** : `backend/test/elo.test.js`
- **Principe** :
  - Compare chaque joueur à tous les autres participants de la session de 8 joueurs.
  - La variation dépend du rang final et de l'écart d'Elo avec les adversaires (battre un joueur mieux classé rapporte plus de points Elo).
  - Somme nulle ou équilibrée sans inflation artificielle.

### Classements Généraux (Leaderboard)
- **Fichier Backend** : `backend/src/controllers/game.controller.js` : `getLeaderboard()`
- **Fichier Frontend** : `frontend/src/pages/Leaderboard.jsx`
- **Filtres** : Classement séparé par mode (`normal`, `chrono`, `knowledge`) et par période (global, mensuel, hebdomadaire).

---

## 7. BOUTIQUE, ABONNEMENTS & PAIEMENTS STRIPE

| Élément | Emplacement Backend | Emplacement Frontend | Description |
| :--- | :--- | :--- | :--- |
| **Plans & Tarifs** | `backend/src/services/subscription.service.js` | `frontend/src/pages/Shop.jsx` | Définition des offres (Gratuit, Pro, Élite). |
| **Checkout Stripe** | `backend/src/services/payment.service.js` : `createCheckoutSession()`<br>Route : `POST /api/subscription/checkout` | `frontend/src/pages/Shop.jsx` : `handleSubscribe()` | Redirige vers la page de paiement sécurisée Stripe. |
| **Webhooks Stripe** | `backend/src/controllers/subscription.controller.js` : `handleWebhook()`<br>Route : `POST /api/subscription/webhook` | — | Traite les événements `checkout.session.completed`, `customer.subscription.deleted`, etc. |
| **Achat de Cosmétiques / Avatars** | `backend/src/controllers/subscription.controller.js` : `buyCosmetic()` | `frontend/src/pages/Shop.jsx` | Déblocage d'avatars et bordures de profil avec pièces ou abonnement. |

---

## 8. PROFIL, HISTORIQUE & STATISTIQUES

- **Page Frontend** : `frontend/src/pages/Profile.jsx`
- **Contrôleur Backend** : `backend/src/controllers/auth.controller.js` (`getProfile`, `getUserGameHistory`)
- **Données affichées** :
  - Elo actuel par mode de jeu (`normal`, `chrono`, `knowledge`).
  - Nombre total de parties jouées, victoires, défaites.
  - Ratio de précision au quiz de connaissances.
  - Historique paginé des dernières parties (date, mode, clics, temps, résultat, gain/perte d'Elo).
  - Gestion des informations personnelles et sécurité du compte.

---

## 9. ADMINISTRATION, MODÉRATION & MAINTENANCE

| Fonctionnalité | Emplacement Backend | Emplacement Frontend |
| :--- | :--- | :--- |
| **Dashboard Admin** | `backend/src/controllers/auth.controller.js` (`getAdminStats`, `getAllUsers`) | `frontend/src/pages/Admin.jsx` |
| **Gestion des Articles / Paires Wiki** | `backend/src/controllers/wiki.controller.js` (`adminCreatePair`, `adminDeletePair`) | `frontend/src/pages/AdminArticles.jsx` |
| **État du Site & Maintenance** | `backend/src/controllers/site-state.controller.js`<br>`backend/src/services/site-state.service.js` :<br>• `getState()`, `updateState()` | `frontend/src/pages/Admin.jsx` (Boutons maintenance, triche admin) |
| **Bannissement & Rôles** | `backend/src/controllers/auth.controller.js` : `updateUserRole()`, `banUser()` | `frontend/src/pages/Admin.jsx` |

---

## 10. SYSTÈME DE SIGNALEMENTS (REPORTS)

- **Backend** :
  - Contrôleur : `backend/src/controllers/report.controller.js` (`createReport`, `getReports`, `updateReportStatus`)
  - Modèle : `backend/src/models/report.model.js`
  - Routes : `backend/src/routes/report.routes.js` (`POST /api/reports`, `GET /api/reports`)
- **Frontend** :
  - Composant Modal : `frontend/src/components/ui/ReportModal.jsx`
  - Déclencheurs :
    - In-game dans la grille des participants (`frontend/src/pages/Game.jsx`).
    - Dans le tiroir de classement latéral (`frontend/src/pages/Game.jsx`).
    - Supporte le signalement des vrais joueurs et des bots (pour test).

---

## 11. INTERNATIONALISATION (I18N) & TRADUCTION

- **Configuration** : `frontend/src/i18n.js` (détecteur de langue navigateur + backend HTTP).
- **Fichiers de traduction** :
  - Français : `frontend/public/locales/fr/translation.json`
  - Anglais : `frontend/public/locales/en/translation.json`
- **Sélecteur de Langue** : `frontend/src/components/ui/LanguageSelect.jsx`
- **Filtrage Wikipédia** : `backend/src/services/wiki-language.service.js` isole les parties selon la langue de l'article (ex. `fr`, `en`).

---

## 12. FOIRE AUX QUESTIONS SPÉCIAL EXAMEN

### Q1 : Où se trouve la fonction qui calcule les points d'une partie ?
👉 **Réponse** : Dans `frontend/src/pages/Game.jsx`, fonction `calculateGamePoints({ mode, clicks, elapsedSeconds, chronoScore, knowledgeScore, won })`.

### Q2 : Où se trouve l'algorithme qui calcule la variation d'Elo entre les joueurs ?
👉 **Réponse** : Dans le backend, fichier `backend/src/models/user.model.js`, fonction `calculateMultiplayerEloDistribution(playersResult)`. Les tests unitaires correspondants sont dans `backend/test/elo.test.js`.

### Q3 : Où est géré le Matchmaking et comment fonctionne le repli solo ?
👉 **Réponse** : Dans `backend/src/services/matchmaking.service.js`. La fonction `joinQueue` enregistre le joueur dans une file d'attente par mode/langue et planifie un repli automatique (`scheduleSoloFallback`) via `setTimeout` si 8 joueurs ne sont pas trouvés rapidement.

### Q4 : Où se trouve la génération du Quiz pour le mode Connaissance ?
👉 **Réponse** : Dans `backend/src/services/knowledge-quiz.service.js`, fonction `generateQuizFromArticles(visitedArticles)`.

### Q5 : Où est implémenté le volet coulissant du classement en direct ?
👉 **Réponse** : Dans `frontend/src/pages/Game.jsx` (balise `<aside className="game-drawer-panel">` pilotée par l'état `showLeaderboardDrawer` et alimentée par `computeLiveLeaderboard`), avec les styles CSS dans `frontend/src/index.css`.

### Q6 : Où se trouve le middleware qui protège les routes réservées aux administrateurs ?
👉 **Réponse** : Dans `backend/src/middlewares/auth.middleware.js`, fonction `requireAdmin(req, res, next)`.

### Q7 : Comment les articles Wikipédia sont-ils sécurisés contre les injections de scripts ?
👉 **Réponse** :
1. Côté backend dans `backend/src/controllers/wiki.controller.js` (`cleanWikiHtml`) via filtrage d'arborescence HTML.
2. Côté frontend dans `frontend/src/pages/Game.jsx` via `DOMPurify.sanitize(html, { ... })`.

### Q8 : Où se trouvent les routes API pour la gestion des signalements ?
👉 **Réponse** : Dans `backend/src/routes/report.routes.js`, associées au contrôleur `backend/src/controllers/report.controller.js`.
