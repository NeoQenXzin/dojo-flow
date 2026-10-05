# DojoFlow V1

**[Ouvrir l’application](https://neoqenxzin.github.io/dojo-flow/)** · [Dépôt GitHub](https://github.com/NeoQenXzin/dojo-flow)

Une application d’entraînement pensée pour le téléphone : bibliothèque d’exercices avec vidéos, séances composées ou aléatoires, chronomètre, comptage des répétitions et journal. Les exercices, les vidéos et les séances restent dans le navigateur, sans compte ni serveur de données.

## Démarrage local

Prérequis : Node.js 22 et npm.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse locale indiquée dans le terminal. Utiliser un serveur HTTP : ouvrir directement `index.html` comme fichier ne permet pas de charger correctement le moteur vidéo ni de préparer le mode hors ligne.

```sh
npm test
npm run build
```

`dist/` contient le site prêt à publier, y compris le moteur de conversion. Le build copie les dépendances FFmpeg installées par npm ; aucun CDN externe n’est nécessaire à l’exécution. Les chemins sont relatifs : le site fonctionne à la racine d’un domaine comme sous `/DojoFlow/`.

Pour les tests de navigateur, installer Chromium avec `npx playwright install chromium webkit`, puis lancer `npm run test:e2e`. Ces tests automatisés ne remplacent pas une vérification sur l’iPhone cible, notamment pour le son, les codecs et les limites de mémoire.

## Vidéos : MP4, MKV et WebM

Le fichier et son codec sont deux choses différentes : `.mp4`, `.mkv` et `.webm` sont des conteneurs. L’app vérifie la lecture avec le navigateur. Les MKV, WebM et les vidéos incompatibles sont convertis automatiquement en **MP4 H.264 / AAC** avant enregistrement. Un bouton permet aussi de convertir une vidéo existante. Un MP4 peut lui aussi contenir un codec non lisible. Renommer l’extension d’un fichier ne change pas son contenu.

Le moteur FFmpeg se télécharge à la demande lors de la première conversion (environ 32 Mo) et ses fichiers sont mis en cache. Les vidéos à convertir restent sur l’appareil ; elles ne sont pas envoyées à un service distant. La première conversion demande une connexion. Après une mise à jour de l’application, les fichiers du moteur peuvent devoir être téléchargés à nouveau.

La conversion utilise un moteur WebAssembly à un seul thread, compatible avec un hébergement statique GitHub Pages sans en-têtes spéciaux. La conversion est limitée à 200 Mo par fichier. Elle est plus lente qu’un convertisseur natif et peut atteindre les limites de mémoire du navigateur sur de gros fichiers. Pour les longs films ou les vidéos 4K, préparer un MP4 H.264/AAC sur ordinateur avant l’import est préférable. Les pistes protégées ou les fichiers endommagés ne deviennent pas lisibles par une simple conversion.

## Installer sur iPhone

1. Ouvrir l’adresse HTTPS publiée dans **Safari**.
2. Ouvrir **Données** et attendre « application prête hors ligne ».
3. Toucher **Partager → Sur l’écran d’accueil → Ajouter**. Selon la version d’iOS, l’action peut se trouver dans les actions supplémentaires du menu Partager.
4. Lancer DojoFlow avec sa nouvelle icône. Importer ou restaurer les exercices depuis cette instance de l’application.
5. Vérifier une courte séance avec une vidéo, puis activer le mode avion et rouvrir l’application pour confirmer le fonctionnement hors ligne sur cet iPhone.

Les vidéos enregistrées en local n’ont pas besoin de réseau. Le navigateur peut toutefois supprimer ses données si l’espace manque ou si les données de sites sont effacées : conserver des sauvegardes complètes. Le bouton d’activation du stockage persistant est disponible lorsque le navigateur le permet.

Une nouvelle version se prépare en arrière-plan. Un bouton apparaît dans **Données** pour l’installer après avoir terminé la séance et fermé les fiches ouvertes. L’app n’impose pas de rechargement pendant un entraînement.

## Sauvegarder et récupérer l’ancienne application

Dans l’ancien fichier `dojoflow (1).html`, ouvrir **Données → Export complet (avec vidéos)**, puis conserver le JSON dans Fichiers, sur un disque ou dans le stockage de son choix. Dans la nouvelle application, choisir ce JSON sous **Restaurer une sauvegarde**, puis **Fusionner**. Utiliser **Remplacer tout** seulement pour remplacer les données actuelles.

Les sauvegardes JSON sont limitées à 512 Mo, à l’export comme à l’import. L’export complet contient les vidéos ; il est donc sensiblement plus volumineux que les fichiers d’origine. L’export léger ne constitue pas une sauvegarde des vidéos. Une restauration sur une autre origine (adresse locale, GitHub Pages, autre domaine) ou un autre appareil se fait par ce fichier : les données ne se synchronisent pas automatiquement. Un raccourci installé et un onglet Safari peuvent aussi disposer d’un stockage différent ; vérifier les données dans l’instance réellement utilisée avant de supprimer l’ancienne.

Le nom de la base IndexedDB reste `dojoflow`. Si l’ancien site et le nouveau sont servis sur la même origine et dans le même espace de stockage du navigateur, les données existantes restent accessibles. Conserver malgré tout un export avant toute migration.

## Publier sur GitHub Pages

1. Créer le dépôt GitHub et y pousser le projet sur la branche `main`, avec `package-lock.json`.
2. Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions** comme source.
3. Le workflow `.github/workflows/pages.yml` installe les dépendances, exécute les tests, construit `dist/`, puis publie ce dossier.
4. Ouvrir l’adresse indiquée par le déploiement, généralement `https://<compte>.github.io/<depot>/`.

Le dépôt et le site contiennent l’application, pas les vidéos personnelles importées dans le navigateur. Ne pas ajouter ses exports JSON ni ses vidéos personnelles au dépôt. Le petit `test-video.mp4` est un média de diagnostic distribué avec l’app.

## Structure

- `index.html`, `styles.css` : interface.
- `app.js` : bibliothèque, séances et navigation.
- `player.js` : lecture des séances, chronomètre, répétitions et sons.
- `storage.js` : IndexedDB, sauvegarde, restauration et espace utilisé.
- `media.js` : import, vérification et conversion des vidéos.
- `pwa.js`, `sw.js`, `manifest.webmanifest` : installation, mises à jour et mode hors ligne.
- `icons/` : icônes ; `python3 scripts/generate-icons.py` régénère les PNG sans dépendance externe.

Les sons et la lecture demandent une interaction utilisateur selon les règles du navigateur. Garder l’application au premier plan pendant une séance ; iOS peut suspendre une page lorsque l’écran se verrouille ou qu’on change d’application. Les autorisations et la disponibilité des API du navigateur peuvent varier selon l’appareil.

## Vérifications de la V1

38 tests unitaires couvrent les transactions, imports, moteurs de séance et service worker. 14 parcours de navigateur sont vérifiés dans Chromium et WebKit : MP4, conversion MKV/WebM, persistance après rechargement, export/restauration, annulation et démarrage après arrêt réel du serveur. Le test hors ligne coupe le serveur pour éviter le [bug de simulation hors ligne de Playwright/WebKit](https://github.com/microsoft/playwright/issues/42775). Une vérification sur iPhone physique reste nécessaire pour le son, l’écran verrouillé et les gros fichiers.
