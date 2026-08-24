# Système de Multijoueur - Documentation

## Vue d'ensemble

Le système de multijoueur pour WikisGuessr utilise un système de **lobbies basés sur des codes**. Chaque utilisateur a un **salon personnel** (room) avec un code unique et persistant.

## Architecture

### Base de données

#### Table `game_rooms`
Stocke les lobbies personnels de chaque utilisateur.

| Colonne | Type | Contraintes |
|---------|------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| code | VARCHAR(12) | UNIQUE, généré aléatoirement |
| owner_id | INT | UNIQUE, FK users(id), ON DELETE CASCADE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Clé unique**: Un seul salon par utilisateur (`owner_id` UNIQUE).

#### Table `game_room_members`
Stocke les participants de chaque salon.

| Colonne | Type | Contraintes |
|---------|------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| room_id | INT | FK game_rooms(id), ON DELETE CASCADE |
| user_id | INT | FK users(id), ON DELETE CASCADE |
| joined_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Clé unique**: Impossible d'avoir le même utilisateur deux fois dans la même room (`room_id, user_id`).

### Backend APIs

#### 1. `GET /api/game-rooms/my` [Authentifié]
Récupère le salon personnel de l'utilisateur connecté.

```json
{
  "room": {
    "id": 1,
    "code": "ABC123",
    "owner_id": 5,
    "created_at": "2026-07-20T10:00:00Z"
  },
  "members": [
    { "id": 2, "username": "alice" },
    { "id": 3, "username": "bob" }
  ]
}
```

**Comportement**:
- Si c'est la première fois que l'utilisateur accède, un nouveau salon est créé avec un code unique.
- Un salon existe une seule fois par utilisateur (grâce à l'unique key sur `owner_id`).

#### 2. `POST /api/game-rooms/join` [Authentifié]
Permet de rejoindre un salon existant en entrant son code.

**Payload**:
```json
{ "code": "ABC123" }
```

**Réponse**:
```json
{
  "room": { ... },
  "members": [ ... ]
}
```

**Validations**:
- Le code doit exister
- L'utilisateur ne peut pas rejoindre son propre salon
- Si déjà dans la room, aucune erreur (INSERT IGNORE)

#### 3. `GET /api/game-rooms/info?code=ABC123` [Public]
Récupère les informations et participants d'un salon sans authentification.

**Utilité**: Permet au frontend d'afficher les détails d'un salon avant de rejoindre.

#### 4. `POST /api/game-rooms/leave` [Authentifié]
Quitter un salon (sauf si propriétaire du salon).

**Payload**:
```json
{ "roomId": 1 }
```

### Frontend

#### Composant Lobby.jsx

Le Lobby a trois sections:

1. **Mon salon**
   - Affiche le code de votre salon personnel
   - Bouton "Copier" pour partager le code facilement
   - Liste des joueurs actuelment dans votre salon
   - Le propriétaire est toujours affiché avec un badge "Vous (propriétaire)"

2. **Rejoindre un salon**
   - Input pour entrer le code d'un salon existant
   - Auto-conversion en majuscules
   - Bouton "Rejoindre"

3. **Lancer une partie**
   - Selection du mode (Normal, Connaissance, Chrono)
   - Bouton "Lancer" pour créer une nouvelle partie

### Flux d'utilisation

#### Créer une session multijoueur

1. **Utilisateur A**: Va au Lobby
   - Voit son code personnel (ex: `ABC123`)
   - Partage ce code à **Utilisateur B**

2. **Utilisateur B**: Va au Lobby
   - Entre le code `ABC123` dans le champ "Rejoindre un salon"
   - Clique "Rejoindre"
   - Est maintenant dans le salon de A

3. **Utilisateur A**: Actualise ou regarde la liste
   - Voit Utilisateur B dans la liste des participants
   - Peut lancer une partie en choisissant le mode

#### Lancer une partie multijoueur

Quand on crée une partie avec `POST /api/games`:
- La partie utilise le **code du salon** (à implémenter dans la prochaine phase)
- Tous les participants du salon peuvent accéder à cette partie
- Les résultats individuels sont enregistrés pour chaque joueur

## Prochaines étapes

### Phase 2: Intégration avec le système de jeu

1. **Modifier `POST /api/games`** pour utiliser le code du salon
2. **Tracker les participants** d'une partie (table `game_participants`)
3. **Synchroniser l'état** entre les joueurs pendant la partie (Socket.io recommandé)
4. **Enregistrer les résultats** par joueur

### Phase 3: Système d'amis et invitations

1. Créer table `friendships` pour tracker les amis
2. Créer table `invitations` pour envoyer des invitations
3. Ajouter endpoints pour:
   - Ajouter un ami
   - Envoyer une invitation de partie
   - Accepter/refuser une invitation

## Particularités de conception

### Pourquoi une table `game_rooms` séparée?

Les salons (rooms) sont **persistants** pour chaque utilisateur:
- Code unique par utilisateur, jamais régénéré
- Chaque utilisateur a toujours son salon
- Permet de partager facilement son code

### Pourquoi une table `game_room_members` séparée?

Permet de tracker **dynamiquement** qui est où:
- Un joueur peut être dans plusieurs salons (en tant que visiteur)
- Un joueur est toujours propriétaire de son propre salon
- Permet les invitations et les rejets

### Code generation

Les codes sont générés avec:
```javascript
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars
const code = crypto.randomBytes(6).map(b => alphabet[b % 32]).join('');
```

**Résultats**: ~32^6 ≈ 1 billion combinaisons possibles

## Exemples d'utilisation

### Créer un salon personnel
```javascript
const response = await gameRoomService.getMyRoom();
// Crée automatiquement si n'existe pas
```

### Rejoindre un salon
```javascript
const response = await gameRoomService.joinRoom('ABC123');
// Ajoute l'utilisateur actuel au salon
```

### Voir les infos d'un salon
```javascript
const response = await gameRoomService.getRoomInfo('ABC123');
// Public, pas besoin d'authentification
```

## Limitations actuelles et TODO

- [ ] Expiration des lobbies (timeouts si inactif longtemps)
- [ ] Notification real-time quand un joueur rejoint (Socket.io)
- [ ] Limite de participants par lobby (ex: max 4)
- [ ] Kick de participants (que le propriétaire)
- [ ] Statut du salon (waiting, in_game, finished)
- [ ] Changement de propriétaire du salon

