
Mettre en place une traduction automatique FR -> EN avec DeepL:

- source unique en francais,
- generation incremental de la cible anglaise,
- mode watch pour retraduire automatiquement pendant le dev.

## 1. Prerequis

- Node.js 18+
- Un compte DeepL API
- Une cle `DEEPL_API_KEY`

## 2. Structure recommandee

Adapte les chemins a ton projet, mais garde cette logique:

```txt
project/
  scripts/
    translate.js
    .translate-cache.json
  frontend/
    public/
      locales/
        fr/
          translation.json
        en/
          translation.json
  backend/
    .env
```

## 3. Installation des dependances

Installe la lib DeepL dans le package qui execute le script:

```bash
npm install deepl-node
```

## 4. Variables d'environnement

Dans ton fichier `.env` (ou equivalent), ajoute:

```env
DEEPL_API_KEY=ta_cle_deepl
```

Important:

- la cle doit etre disponible dans le process Node qui lance `translate.js`,
- sans cette cle, le script doit echouer en mode normal.

## 5. Initialiser les fichiers de locale

1. Cree la source FR:

```json
{
  "nav": {
    "home": "Accueil"
  },
  "hero": {
    "title": "Bienvenue {{name}}"
  }
}
```

2. Cree la cible EN vide:

```json
{}
```

## 6. Installer le script de traduction

Copie le script dans `scripts/translate.js` et ajuste uniquement les chemins si besoin.

```js
const fs = require('node:fs');
const path = require('node:path');
const { Translator } = require('deepl-node');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'backend', '.env');
const LOCALES_DIR = path.join(ROOT, 'frontend', 'public', 'locales');
const SOURCE_FILE = path.join(LOCALES_DIR, 'fr', 'translation.json');
const CACHE_FILE = path.join(__dirname, '.translate-cache.json');
const TARGETS = {
  en: 'EN-US',
};
const WATCH_MODE = process.argv.includes('--watch');

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    return;
  }

  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function flattenObject(obj, prefix = '', output = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, nextKey, output);
    } else {
      output[nextKey] = String(value);
    }
  }

  return output;
}

function expandObject(map) {
  const result = {};

  for (const [fullKey, value] of Object.entries(map)) {
    const keys = fullKey.split('.');
    let current = result;

    for (let index = 0; index < keys.length - 1; index += 1) {
      current[keys[index]] ??= {};
      current = current[keys[index]];
    }

    current[keys[keys.length - 1]] = value;
  }

  return result;
}

function protectVariables(text) {
  const variables = [];
  return {
    variables,
    text: text.replace(/\{\{\s*[^}]+\s*\}\}/g, (match) => {
      variables.push(match);
      return `__VAR_${variables.length - 1}__`;
    }),
  };
}

function restoreVariables(text, variables) {
  return text.replace(/__VAR_(\d+)__/g, (_, index) => variables[Number(index)] ?? '');
}

async function translateLanguage(translator, lang, deeplLang, sourceMap, previousSourceMap) {
  const targetFile = path.join(LOCALES_DIR, lang, 'translation.json');
  const targetMap = flattenObject(readJson(targetFile));
  // Cles modifiees dans FR OU absentes du fichier cible
  const changed = Object.entries(sourceMap).filter(
    ([key, text]) => previousSourceMap[key] !== text || !(key in targetMap)
  );
  let removed = 0;

  for (const key of Object.keys(targetMap)) {
    if (!(key in sourceMap)) {
      delete targetMap[key];
      removed += 1;
    }
  }

  if (!changed.length && !removed) {
    console.log(`OK ${lang} -> aucune cle modifiee`);
    return;
  }

  if (changed.length) {
    // On envoie seulement les nouvelles cles FR ou celles qui ont change.
    const prepared = changed.map(([key, text]) => ({ key, ...protectVariables(text) }));
    const translated = await translator.translateText(
      prepared.map((item) => item.text),
      'fr',
      deeplLang
    );

    prepared.forEach((item, index) => {
      targetMap[item.key] = restoreVariables(translated[index].text, item.variables);
    });
  }

  writeJson(targetFile, expandObject(targetMap));
  console.log(`OK ${lang} -> ${changed.length} cle(s) retraduites${removed ? `, ${removed} supprimee(s)` : ''}`);
}

async function translateAll() {
  loadEnv();
  if (!process.env.DEEPL_API_KEY) {
    throw new Error('DEEPL_API_KEY manquant dans backend/.env');
  }

  const sourceMap = flattenObject(readJson(SOURCE_FILE));
  const previousSourceMap = readJson(CACHE_FILE);
  const translator = new Translator(process.env.DEEPL_API_KEY);

  for (const [lang, deeplLang] of Object.entries(TARGETS)) {
    await translateLanguage(translator, lang, deeplLang, sourceMap, previousSourceMap);
  }

  writeJson(CACHE_FILE, sourceMap);
}

async function run() {
  try {
    await translateAll();
  } catch (error) {
    console.error(error.message);
    if (!WATCH_MODE) {
      process.exit(1);
    }
  }
}

function startWatch() {
  console.log('Mode watch actif sur la source FR');
  run();

  let timeoutId = null;
  let isRunning = false;
  fs.watch(SOURCE_FILE, () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      if (isRunning) return;
      isRunning = true;
      await run();
      isRunning = false;
    }, 250);
  });
}

if (WATCH_MODE) {
  startWatch();
} else {
  run();
}
```

Comportements a conserver:

1. Lecture de la source FR.
2. Flatten des cles (`a.b.c`) pour comparer facilement.
3. Comparaison avec un cache FR precedent.
4. Retraduction uniquement des cles modifiees ou manquantes.
5. Suppression des cles cibles qui n'existent plus en FR.
6. Protection/restauration des placeholders `{{variable}}`.
7. Ecriture du JSON cible et mise a jour du cache.

## 7. Ajouter les scripts npm

Dans le `package.json` racine (ou du package qui porte le script):

```json
{
  "scripts": {
    "translate": "node scripts/translate.js",
    "translate:watch": "node scripts/translate.js --watch"
  }
}
```

## 8. Premier lancement

Lance:

```bash
npm run translate
```

Resultat attendu:

- `locales/en/translation.json` est rempli,
- `scripts/.translate-cache.json` est cree.

## 9. Mode watch (dev)

Lance:

```bash
npm run translate:watch
```



## 10. Integration i18n frontend

Ton frontend doit charger les fichiers depuis:

- `/locales/fr/translation.json`
- `/locales/en/translation.json`


## 11. Workflow quotidien

1. Modifier uniquement `fr/translation.json`.
2. Lancer `translate` (ou garder `translate:watch` actif).
3. Verifier la sortie EN.
4. Ajuster manuellement EN si besoin.

Note importante:

- une correction manuelle EN est preservee tant que la valeur FR de la meme cle ne change pas.
