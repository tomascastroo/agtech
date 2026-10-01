// MapLibre GL v6 (ESM) carga su web worker desde un archivo separado que el bundler no emite.
// Se copia el worker (y su módulo compartido) de la versión instalada a public/maplibre/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const dist = dirname(require.resolve('maplibre-gl/package.json'));
const target = join(root, 'public/maplibre');
mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(dist, 'dist', file), join(target, file));
}
