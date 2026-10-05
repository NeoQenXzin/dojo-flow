# Composants tiers

Le build redistribue sans modification `@ffmpeg/ffmpeg` 0.12.15 (wrapper JavaScript, MIT) et `@ffmpeg/core` 0.12.10 (FFmpeg WebAssembly à un seul thread, GPL-2.0-or-later et licences des bibliothèques liées). Leurs versions et intégrités npm sont verrouillées dans `package-lock.json` ; leurs manifestes sont également distribués dans `vendor/ffmpeg-package.json` et `vendor/core-package.json`.

Les deux versions sont présentes dans le dépôt amont au tag **`v12.15`** (sans `0.` après le `v`) :

- [Sources et scripts de compilation ffmpeg.wasm, tag v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15).
- [Manifeste du wrapper 0.12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/ffmpeg/package.json) et [licence MIT, copyright 2019 Jerome Wu](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/LICENSE).
- [Manifeste du core 0.12.10 et licence déclarée GPL-2.0-or-later](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/packages/core/package.json).
- [Recette Docker de compilation](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile) et [scripts de compilation](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15/build). La recette référence FFmpeg `n5.1.4`, active `--enable-gpl` et relie notamment x264 et x265. Elle indique les dépôts et références des autres bibliothèques intégrées.
- [Sources FFmpeg n5.1.4](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4), [texte GPL version 2](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/COPYING.GPLv2) et [informations de licence FFmpeg](https://ffmpeg.org/legal.html).
- [Sources du fork x264 référencé par la recette](https://github.com/ffmpegwasm/x264/tree/4-cores) et [licence x264](https://github.com/ffmpegwasm/x264/blob/4-cores/COPYING).

Les conditions de redistribution s’appliquent aussi à une distribution gratuite. Les notices de copyright, les textes de licence et l’accès aux sources correspondantes doivent accompagner les composants redistribués ; les liens ci-dessus documentent leur provenance et ne constituent pas une exemption de ces conditions. Certaines dépendances de la recette amont sont référencées par des branches : cette recette seule ne décrit donc pas un instantané immuable de toutes leurs sources.

Les textes de licence et notices des bibliothèques sont distribués dans [licenses/](licenses/SOURCES.json). `SOURCES.json` indique pour chaque texte son adresse amont ; `scripts/fetch-licenses.mjs` permet de les récupérer à nouveau. Le test vidéo livré est une mire synthétique générée pour DojoFlow, sans vidéo personnelle.
