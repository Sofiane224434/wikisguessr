# 🚀 Guide & Checklist des Bonnes Pratiques de Référencement Naturel (SEO) — WikisGuessr

Ce document regroupe les meilleures pratiques incontournables et concrètes pour optimiser le référencement naturel (SEO technique, on-page, sémantique, international et performance) d'une application web comme **WikisGuessr**.

---

## 1. 🏷️ Balises HTML & Métadonnées On-Page

- **Balise `<title>` unique et percutante par page** :
  - Structure recommandée : `Action / Sujet principal | WikisGuessr - Le Jeu Wikipédia` (ex. : `Jeu Wikipédia Multijoueur & Défi Liens | WikisGuessr`).
  - Longueur idéale : entre 50 et 60 caractères (pour éviter la troncature dans les SERP Google).
  - Inclure les mots-clés stratégiques dès le début du titre (ex. *Jeu Wikipédia*, *Wiki Game*, *Speedrun Wikipédia*).

- **Balise `<meta name="description">` attractive** :
  - Longueur recommandée : entre 130 et 155 caractères.
  - Formuler un pitch engageant avec un Call-To-Action (ex. : *« Reliez deux articles Wikipédia en un minimum de clics. Défiez vos amis en multijoueur temps réel sur WikisGuessr ! »*).

- **Hiérarchie stricte des titres sémantiques (`<h1>` à `<h3>`)** :
  - **Un seul `<h1>` par page** contenant le mot-clé principal de la page.
  - Ne jamais sauter de niveau de titre (ex. `<h1>` ➔ `<h2>` ➔ `<h3>`, pas de passage direct de `<h1>` à `<h3>`).
  - Utiliser les titres pour structurer logiquement le contenu, pas uniquement pour le style visuel.

- **Balise `<link rel="canonical">`** :
  - Définir l'URL canonique absolue sur chaque page (ex. `<link rel="canonical" href="https://wikisguessr.azim404.com/" />`) pour éviter les pénalités de contenu dupliqué avec ou sans paramètres d'URL.

- **Balises Open Graph (Facebook/LinkedIn/Discord) et Twitter Cards** :
  - `<meta property="og:title" content="..." />`
  - `<meta property="og:description" content="..." />`
  - `<meta property="og:image" content="https://wikisguessr.azim404.com/assets/img/og-preview.jpg" />` (ratio 1200x630 px).
  - `<meta property="og:url" content="..." />`
  - `<meta property="og:type" content="website" />`
  - `<meta name="twitter:card" content="summary_large_image" />`

- **Attributs `alt` sur toutes les images** :
  - Décrire textuellement le contenu visuel ou l'action pour l'accessibilité et l'indexation Google Images (ex. `alt="Aperçu du mode de jeu Exploration classique WikisGuessr"`).
  - Pour les icônes purement décoratives, utiliser `aria-hidden="true"` ou `alt=""`.

---

## 2. 🤖 Indexabilité, Crawlabilité & Architecture Technique

- **Fichier `robots.txt` propre et accessible à la racine** :
  - Autoriser l'exploration des pages publiques (`Allow: /`).
  - Bloquer les routes d'administration, d'API privée ou d'authentification (`Disallow: /admin`, `Disallow: /api/`).
  - Pointer directement vers le sitemap : `Sitemap: https://wikisguessr.azim404.com/sitemap.xml`.

- **Fichier `sitemap.xml` dynamique et valide** :
  - Lister toutes les URLs indexables canoniques (`/`, `/lobby`, `/leaderboard`, `/login`).
  - Définir `<lastmod>`, `<changefreq>`, et `<priority>`.
  - Soumettre le sitemap dans Google Search Console et Bing Webmaster Tools.

- **Gestion du rendu SPA (Single Page Application)** :
  - Les moteurs de recherche indexent JavaScript, mais le rendu côté serveur (SSR) ou le **prerendering** statique des pages d'accueil et de présentation garantit une indexation instantanée et sans faille.
  - S'assurer que le contenu textuel principal est présent dans le DOM initial ou chargé rapidement sans authentification requise.

- **Codes HTTP & Redirections** :
  - Forcer la redirection **HTTPS** permanente (code 301).
  - Rediriger `www` vers non-`www` (ou inversement) de manière cohérente via Nginx.
  - Retourner un véritable code HTTP 404 sur les pages introuvables.

- **Structure d'URLs claires et descriptives** :
  - Préférer `/modes/chrono`, `/classement`, `/regles-du-jeu` plutôt que des URLs avec IDs opaques ou paramètres incompréhensibles.

---

## 3. ⚡ Performances & Core Web Vitals (Signaux Web Essentiels)

Google utilise les Core Web Vitals comme critères de classement direct :

- **LCP (Largest Contentful Paint < 2.5s)** :
  - Précharger l'image Hero principale (`<link rel="preload" as="image" href="..." />`).
  - Utiliser des formats d'image modernes et ultra-compressés : **WebP** ou **AVIF**.
  - Héberger les polices localement avec `font-display: swap` pour éviter les blocages de rendu.

- **INP (Interaction to Next Paint < 200ms)** :
  - Minimiser l'exécution de JavaScript lourd sur le thread principal lors des clics et interactions utilisateur.
  - Découper les gros bundles JS via le code-splitting (`React.lazy` et imports dynamiques).

- **CLS (Cumulative Layout Shift < 0.1)** :
  - Définir explicitement les dimensions `width` et `height` (ou `aspect-ratio`) sur toutes les images, bannières et vidéos pour éviter les sauts de mise en page au chargement.
  - Réserver l'espace des bannières et composants asynchrones avec des placeholders/skeletons.

- **Optimisation Nginx & Compression serveur** :
  - Activer la compression **Gzip** ou **Brotli** pour les fichiers HTML, CSS, JS et JSON.
  - Configurer des en-têtes de cache navigateur longs (`Cache-Control: public, max-age=31536000, immutable`) pour les assets statiques avec hash de build Vite.

---

## 4. 🧠 Données Structurées & Schema.org (JSON-LD)

Intégrer des données structurées au format JSON-LD dans le `<head>` pour enrichir les résultats de recherche (Rich Snippets) :

- **Schema `WebSite` & `SearchAction`** :
  ```json
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "WikisGuessr",
    "url": "https://wikisguessr.azim404.com",
    "description": "Le jeu d'exploration et de speedrun sur Wikipédia en multijoueur."
  }
  ```

- **Schema `VideoGame` / `SoftwareApplication`** :
  ```json
  {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "name": "WikisGuessr",
    "gamePlatform": "Web Browser",
    "applicationCategory": "Game",
    "genre": ["Trivia", "Educational", "Puzzle", "Speedrun"],
    "playMode": ["SinglePlayer", "MultiPlayer"],
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR"
    }
  }
  ```

- **Schema `FAQPage` pour la section "Comment jouer"** :
  - Permet d'afficher des questions/réponses dépliables directement dans les résultats Google (ex. *Comment relier deux articles Wikipédia sans tricher ?*).

---

## 5. 🌍 SEO International & Multilingue (i18n)

- **Balise `lang` sur l'élément `<html>`** :
  - Mettre à jour dynamiquement `document.documentElement.lang = i18n.language` (ex. `fr`, `en`, `es`).

- **Balises `hreflang`** :
  - Indiquer à Google les versions alternatives disponibles :
    ```html
    <link rel="alternate" hreflang="fr" href="https://wikisguessr.azim404.com/?lng=fr" />
    <link rel="alternate" hreflang="en" href="https://wikisguessr.azim404.com/?lng=en" />
    <link rel="alternate" hreflang="x-default" href="https://wikisguessr.azim404.com/" />
    ```

- **Indexabilité des contenus traduits** :
  - Éviter de baser la langue uniquement sur le `localStorage` sans URL dédiée ou paramètre accessible par les robots de crawl.

---

## 6. 🔗 Maillage Interne & Contenu Sémantique

- **Liens internes textuels explicites** :
  - Utiliser des ancres de liens descriptives : préférer *« Consulter le classement multijoueur »* plutôt que *« Cliquez ici »*.
  - Créer des pages de guides éditoriaux (ex. *« Les meilleurs raccourcis Wikipédia »*, *« Histoire et règles du Wiki Game »*) pour capter du trafic d'intention informationnelle sur Google.

- **Densité et cocon sémantique** :
  - Enrichir le champ lexical autour du jeu : *Wikipedia game, speedrun encyclopédie, défi culturel, liens hypertextes, jeu multijoueur en ligne gratuit, quiz de culture générale*.

- **Partage social et rétention** :
  - Générer des liens de résumé de partie avec OpenGraph dynamique (score, clics, articles reliés) pour favoriser le backlinking naturel sur Reddit, Twitter/X et Discord.

---

## 7. 📱 Expérience Utilisateur (UX Mobile) & Accessibilité

- **Mobile-Friendly absolu** :
  - Viewport correctement configuré : `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`.
  - Cibles tactiles d'au moins 48x48 px pour les boutons et liens.
  - Zéro défilement horizontal parasite.

- **Signaux d'engagement (Dwell Time & Bounce Rate)** :
  - Réduire le temps d'accès au jeu : le bouton Call-To-Action **« Joue ! »** au-dessus de la ligne de flottaison incite à l'action immédiate et réduit le taux de rebond.
  - Des animations fluides et un design immersif augmentent la durée moyenne des sessions.

---

## 8. 📊 Outils d'Audit & Suivi Continu

- **Google Search Console** :
  - Vérifier la couverture d'indexation, inspecter les URLs et surveiller les mots-clés qui génèrent des impressions/clics.
- **PageSpeed Insights & Lighthouse** :
  - Viser un score SEO > 95 et Performance > 90.
- **Google Analytics 4 / Plausible Analytics (respectueux RGPD)** :
  - Suivre les sources de trafic organique et les taux de conversion d'inscription.
- **Screaming Frog SEO Spider** :
  - Auditer régulièrement les liens cassés (404), les redirections et les balises manquantes.
