# Orthographe 60 — site de révision

Un espace de révision responsive pour une classe : fiches de règles, exceptions, quiz variés, comptes élèves, score et administration privée.

## Fonctionnalités

- Interface adaptée aux ordinateurs, tablettes et téléphones.
- Création de compte élève et connexion par identifiant/mot de passe.
- Compte administrateur initialisé une seule fois avec une clé secrète Cloudflare.
- Liste de règles : chaque fiche contient plusieurs parties (nom, règle, exception facultative).
- Séries d'exercices importées en JSON depuis le panneau admin.
- Quiz QCM, vrai/faux et réponses écrites.
- Correction effectuée côté serveur : +1 point par bonne réponse, −1 point par mauvaise réponse.
- Classement et affichage des scores.
- Les réponses attendues ne sont pas envoyées au navigateur avant la correction.

## Architecture et sécurité

Le site utilise Cloudflare Pages Functions pour l'API et Cloudflare D1 pour les comptes, les fiches et les scores. Un hébergement purement statique (par exemple GitHub Pages seul) ne permettrait pas de protéger réellement le compte admin ou de vérifier les points côté serveur.

Les mots de passe sont hachés avec PBKDF2-SHA-256 et un sel unique. Les sessions sont des cookies HttpOnly, Secure et SameSite=Lax ; la base ne conserve que le hachage du jeton de session. Les actions d'administration sont contrôlées par l'API, pas seulement masquées dans l'interface.

**Ne place jamais un mot de passe, une clé admin ou un identifiant secret dans un fichier du dépôt GitHub.** Configure-les comme variables d'environnement/secrets Cloudflare. Pour la classe, utilise des pseudonymes et évite de demander des informations personnelles inutiles.

## Déploiement Cloudflare Pages

### 1. Relier le dépôt

1. Ouvre le tableau de bord Cloudflare, puis **Workers & Pages**.
2. Choisis **Create application** puis **Pages**, et connecte ton compte GitHub.
3. Sélectionne le dépôt `Axoboys/orthographe-60-regles` et la branche `main`.
4. Choisis le préréglage **None** (aucun framework).
5. Mets la commande de build à `exit 0` et le dossier de sortie sur `.` (racine du dépôt). Cloudflare recommande `exit 0` pour les sites sans compilation qui utilisent Pages Functions.
6. Lance le déploiement.

Les fichiers `functions/` seront utilisés automatiquement par Cloudflare Pages Functions.

### 2. Créer et relier la base D1

1. Dans Cloudflare, ouvre **D1 SQL Database** (ou la section D1 de Workers & Pages) et crée une base nommée `orthographe-60-db`.
2. Ouvre l'onglet **Console** de cette base.
3. Copie-colle tout le contenu du fichier `migrations/0001_initial.sql` de ce dépôt, puis exécute-le.
4. Ouvre ton projet Pages : **Settings → Bindings → Add → D1 database**.
5. Comme nom de variable (binding), écris exactement `DB`, puis sélectionne `orthographe-60-db`.
6. Enregistre et redéploie le projet pour que la fonction prenne en compte le binding.

### 3. Configurer le compte administrateur

Dans les paramètres de ton projet Pages, ouvre **Settings → Variables and Secrets** (pour l'environnement Production) et ajoute :

| Nom | Type | Valeur |
| --- | --- | --- |
| `ADMIN_USERNAME` | Variable | L'identifiant admin que tu as choisi, par exemple `ProfOrthographe` |
| `ADMIN_SETUP_KEY` | Secret | Une longue clé aléatoire que tu gardes privée |

La clé `ADMIN_SETUP_KEY` doit rester confidentielle. Ne la colle pas dans GitHub, dans le code, ni dans un message. Enregistre les changements et redéploie.

Puis :
1. Ouvre l'adresse du site.
2. Sur l'écran de connexion, clique sur **Initialiser le compte administrateur**.
3. Saisis l'identifiant configuré dans `ADMIN_USERNAME`, choisis un mot de passe solide d'au moins 10 caractères et entre la clé `ADMIN_SETUP_KEY`.
4. Une fois créé, ce formulaire d'initialisation est désactivé. Connecte-toi normalement avec ce compte.

L'initialisation ne peut réussir qu'une fois par base D1. Les autres comptes créés depuis le site ont automatiquement le rôle élève.

### 4. Tester

- Crée un deuxième compte élève avec un pseudonyme.
- Ajoute une règle depuis **Administration → Règles**.
- Ajoute une série depuis **Administration → Exercices**.
- Connecte-toi avec le compte élève, fais le quiz et vérifie le score et le classement.

## Ajouter une règle

Dans **Administration → Règles**, saisis un titre puis ajoute autant de parties que nécessaire. Chaque partie comprend :
- **Nom** : titre de la partie.
- **Règle** : explication à apprendre.
- **Exception** : facultative.

Les règles sont créées au fur et à mesure. Les 60 fiches ne sont pas préremplies : le contenu doit correspondre exactement au cours de la classe.

## Ajouter une série d'exercices

Dans **Administration → Exercices**, choisis la règle, donne un titre, puis colle un tableau JSON contenant 3 à 30 questions.

Trois formats sont acceptés :

### QCM (`choice`)
- `options` : liste de propositions.
- `answer` : index de la bonne proposition, en commençant à `0`.

### Vrai/faux (`boolean`)
- `answer` : `true` ou `false`.

### Réponse écrite (`text`)
- `accepted` : liste des réponses acceptées.
- La comparaison ignore la casse et les espaces en trop, mais respecte les accents et les lettres. Cela permet de travailler réellement l'orthographe.

Chaque question peut avoir une explication avec `explanation`.

Exemple complet à coller :

```json
[
  {
    "type": "choice",
    "prompt": "Quelle proposition est correctement écrite ?",
    "options": ["Des journal", "Des journaux", "Des journales"],
    "answer": 1,
    "explanation": "Le pluriel de « journal » s’écrit « journaux »."
  },
  {
    "type": "boolean",
    "prompt": "Au pluriel, tous les noms en -al prennent -aux.",
    "answer": false,
    "explanation": "Il existe des exceptions : certains noms prennent un -s."
  },
  {
    "type": "text",
    "prompt": "Complète : un cheval, des …",
    "accepted": ["chevaux"],
    "explanation": "Le pluriel de cheval est chevaux."
  }
]
```

Les réponses correctes sont conservées dans la base et ne sont envoyées à l'élève qu'après validation du quiz.

## Notes importantes

- La suppression d'une règle supprime aussi ses séries d'exercices liées.
- Le score est cumulatif. Une mauvaise réponse retire bien un point, même si le total devient négatif.
- Les quiz ne peuvent être corrigés qu'une seule fois.
- Cette première version ne contient pas encore les 60 règles du cours. Envoie les règles au fur et à mesure pour préparer les exercices adaptés.
- Si tu changes les paramètres de liaison D1 ou les secrets, redéploie le projet Pages.

## Développement local (facultatif)

Pour tester localement, installe Node.js puis Wrangler et lance Pages en mode développement avec un binding D1 local. La configuration locale doit utiliser le binding `DB` et la migration SQL avant de lancer les quiz. Le déploiement Cloudflare Pages relié à GitHub reste le chemin le plus simple pour la mise en ligne.

## Documentation Cloudflare

- Pages Functions : https://developers.cloudflare.com/pages/functions/
- Bindings D1 pour Pages Functions : https://developers.cloudflare.com/pages/functions/bindings/
- Configuration Pages : https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Migrations D1 : https://developers.cloudflare.com/d1/reference/migrations/
