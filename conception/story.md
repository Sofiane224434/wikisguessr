1. Présentation du Projet
WikisGuessr est une application web moderne et multijoueur inspirée du concept du "WikiGame". L'objectif est de relier une page Wikipédia de départ à une page d'arrivée en utilisant uniquement les liens hypertextes internes. Le projet se distingue par une interface soignée et l'intégration d'une dimension pédagogique innovante via un quiz final.

2. Modes de Jeu
Le Mode Normal (Classique) : Une course de vitesse pure. Les joueurs doivent atteindre la cible le plus vite possible avec le moins de clics possible.

Le Mode Connaissance (L'Innovation) : À la fin de la course (une fois la cible atteinte ou le temps écoulé), le joueur doit répondre à un quiz généré dynamiquement avec questions aléatoires. Les questions portent uniquement sur les pages par lesquelles le joueur est réellement passé. Pas de niveaux de difficulté pour le MVP.

Le Système de Score : Le gagnant n'est pas forcément le plus rapide, mais celui qui combine vitesse de navigation et rétention d'informations (Score final = Points de vitesse + Points de quiz).

3. Spécifications Techniques (Validation Titre DWWM)
Pour répondre aux exigences du titre professionnel, le projet utilise une architecture complète :

Technologies Frontend : React ou Next.js avec Tailwind CSS pour une interface fluide, moderne et "responsive".

Authentification : Email/password + OAuth (Google, GitHub) pour flexibilité d'accès.

Technologies Backend : Node.js avec Socket.io pour gérer le multijoueur en temps réel (salons de jeu, progression des adversaires).

Base de Données : MySQL 8 pour un système relationnel robuste et cohérent avec l'infrastructure actuelle.

4. Architecture de la Base de Données (Version Evolutive)
Le système repose sur une structure relationnelle optimisee et extensible. Le nombre de tables n'est pas fixe pour l'instant :

Users : Gestion des comptes joueurs et de l'authentification.

Games : Enregistrement des sessions de jeu et des paramètres de partie.

Participations : Table de liaison reliant les joueurs aux parties, stockant le score final.

Steps : Historique précis du chemin parcouru par chaque joueur (utile pour générer le quiz).

Questions : Stockage des questions extraites des "Infobox" Wikipédia.

UserAnswers : Enregistrement des réponses des joueurs pour analyse et notation.

5. Intelligence du Jeu et Algorithmes
Génération de Questions : Utilisation de l'API MediaWiki et Wikidata pour extraire des faits bruts (dates, lieux, noms) de manière gratuite et illimitée, sans dépendre d'IA payantes.

Validation des Réponses : Pour les questions à saisie libre, un algorithme de "Fuzzy Matching" (Distance de Levenshtein) est utilisé. Il permet d'accepter les réponses malgré des fautes de frappe (ex: 85% des points si une seule lettre est fausse).

Sécurité et Modération : Filtrage automatique des sujets sensibles (politique, religion) via les catégories Wikipédia pour garantir une expérience de jeu neutre et factuelle.

6. Fonctionnalités Multijoueurs
Creation de salons prives avec codes d'acces.
- Duree de vie du salon : expires automatiquement apres la partie (nettoyage automatique).
- Pas d'archive/historique des salons pour le MVP.

Chat de salon en temps reel (hors jeu) : les joueurs presents dans le meme salon peuvent discuter avant et apres la partie. Le chat est volontairement desactive pendant la manche pour ne pas influencer le gameplay.

Affichage de la progression des autres joueurs en direct.

Système de vote communautaire : si un joueur estime que sa réponse a été injustement refusée par l'algorithme, les autres joueurs peuvent voter pour lui accorder le point.

7. Experience Visuelle (Ambiance Bibliotheque)
Direction artistique souhaitee : un fond doux, dessine, inspire bibliotheque ancienne, sans surcharge visuelle.

Elements graphiques attendus :
- Trames legeres rappelant etageres, livres et papier texture.
- Incrustation subtile de lettres et chiffres grecs et romains en decor.
- Contraste lisible pour conserver le confort de lecture.

8. Moderation, Reports et Roles
Systeme de report depuis le lobby :
- Report de message (chat lobby).
- Report de joueur.
- Champ de raison obligatoire (texte libre) au moment du signalement.

Back-office moderation :
- Page admin pour consulter les reports recus (etat, date, auteur du report, cible, raison).
- Actions de moderation : avertir, masquer/supprimer message, bannir compte.

Gestion des roles (MVP) :
- Admin : centralise la moderation (traitement reports, bannissements, avertissements) + gestion globale (roles, tarifs, pages/modales en construction, parametres).

Fonctionnalite bonus (evolution future) :
- Moderateurs : role secondaire destine a assister l'admin sur la moderation uniquement (pas d'acces aux parametres ou tarifs). Peut etre implemente une fois le systeme d'admin stable.

9. Boutique et Monetisation (MVP)
Modele economique de base :
- Limite de 15 parties par jour pour les joueurs non abonnes (joueurs gratuits).
- Depassement de limite : proposition d'abonnement avec message "Tu as atteint ta limite quotidienne. Abonne-toi pour jouer illimite.".

Abonnement premium :
- Acces illimite aux parties.
- Prix : 4,99 EUR/mois (paiement mensuel).
- Possibilite d'etendre a d'autres durees (annuel, etc.) selon evolution future.

Systeme de paiement :
- Paiement direct (pas de panier d'achat) : l'utilisateur clique sur "Acheter l'abonnement" et accede directement au formulaire de paiement.
- Integracion avec Stripe pour gestion des abonnements et renouvellements automatiques.

Back-office admin (tarification) :
- L'admin peut modifier les prix, activer/desactiver une offre, mettre en avant une offre.
- L'admin peut ajuster la limite quotidienne (actuellement 15 parties/jour pour les gratuits).

10. Profil, Classements et Aide
Profil joueur :
- Page profil avec options de compte (pseudo, avatar avec upload image, preferences de langue, confidentialite de base).

Classements :
- Classement journalier.
- Classement global.

Page Aide :
- Suivi de ses propres reports (statut, reponse moderation).
- Formulaire pour envoyer un mail a l'equipe admin.
- FAQ.
- Regles du jeu.

11. Compte Invite et Controle d'Acces
Mode invite :
- Un utilisateur non connecte peut naviguer librement sur les pages publiques (consultation).
- Le compte invite dispose de fonctionnalites reduites (pas d'actions sociales, pas d'achats, pas d'administration).

Regle d'interaction protegee :
- Si un invite clique sur une fonctionnalite necessitant une connexion (chat, report, boutique, profil complet, participation classee, etc.), il est redirige vers la page d'accueil contenant l'inscription/connexion.
- Un message clair de contexte est affiche : "Connecte-toi ou cree un compte pour utiliser cette fonctionnalite".

Matrice d'acces (MVP) :
- Invite : lecture pages publiques uniquement.
- Joueur connecte : acces gameplay + fonctionnalites utilisateur (chat, profil, classements).
- Admin : moderation + gestion globale (roles, tarifs, pages/modales en construction, parametres).

12. Décisions Techniques Validées (2026-04-30)

**Authentification :**
- Email/password pour inscription/connexion directe.
- OAuth (Google, GitHub) pour accès rapide.

**Base de Données :**
- MySQL 8 (cohérence avec infrastructure VPS actuelle déployée).
- Pas de migration PostgreSQL pour le MVP.

**Mécanique des Salons :**
- Les salons expirent automatiquement après la fin de la partie.
- Nettoyage auto, pas d'archivage pour le MVP.

**Quiz & Questions :**
- Questions aléatoires tirées de la pool des pages visitées.
- Pas de niveaux de difficulté pour le MVP (tout est aléatoire).

**Système de Paiement :**
- Provider: **Stripe** (gestion abonnements + webhooks + renouvellements auto).
- Paiement direct, sans panier d'achat.

**Système d'Avatar :**
- Upload image personnalisée (JPG/PNG, max 5MB).
- Stockage backend/uploads sur le VPS.

**Design & UX :**
- Lot 5 prioritaire après gameplay fonctionnel (pas MVP).
- Fond bibliothèque doux + lettres grecs/romains en décor.

**Ordre d'Implémentation :**
- Lot 1 (Admin + Chat + Reports) et Gameplay (Partie + Quiz + Score) **en parallèle**.
- Dépendances minimales pour permettre un dev simultané.

13. Priorisation fonctionnelle recommandee
Lot 1 (priorite haute) : mode invite + garde d'acces (redirection accueil/inscription) + lobby chat + reports + back-office admin minimal (moderation + tarifs).
Lot 2 (priorite haute) : profil + classements journalier/global.
Lot 3 (priorite moyenne) : page aide complete (suivi reports, contact admin, FAQ, regles).
Lot 4 (priorite moyenne) : boutique MVP + gestion de prix par admin.
Lot 5 (priorite UX) : fond bibliotheque doux et declinaisons visuelles des pages principales.
Lot 6 (bonus, evolution) : role moderateur pour assister l'admin sur la moderation uniquement.
