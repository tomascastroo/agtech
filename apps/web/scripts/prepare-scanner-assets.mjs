// Escáner de Bovinos: copia ONNX Runtime Web (WebGPU + WASM) a public/ort/ y deja el modelo
// YOLOX-Nano (Megvii, Apache-2.0) en public/models/, verificado por SHA-256. El modelo se toma
// del servicio de visión si ya está descargado (apps/ai-service/models) o de la release oficial.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
// El paquete no exporta package.json: se ubica dist/ a partir del punto de entrada.
const ortDist = dirname(require.resolve('onnxruntime-web'));
const ortTarget = join(root, 'public/ort');
mkdirSync(ortTarget, { recursive: true });
for (const file of [
  'ort.webgpu.min.mjs',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
]) {
  copyFileSync(join(ortDist, file), join(ortTarget, file));
}

const MODELS = {
  yolox_nano: 'c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d',
};
const RELEASE = 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0';
const modelsTarget = join(root, 'public/models');
mkdirSync(modelsTarget, { recursive: true });
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

for (const [name, expected] of Object.entries(MODELS)) {
  const target = join(modelsTarget, `${name}.onnx`);
  if (existsSync(target) && sha256(readFileSync(target)) === expected) continue;
  const local = join(root, '../ai-service/models', `${name}.onnx`);
  let bytes = existsSync(local) ? readFileSync(local) : null;
  if (!bytes || sha256(bytes) !== expected) {
    const response = await fetch(`${RELEASE}/${name}.onnx`);
    if (!response.ok) throw new Error(`${name}: descarga fallida (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (sha256(bytes) !== expected) throw new Error(`${name}: SHA-256 inesperado`);
  writeFileSync(target, bytes);
  process.stdout.write(`${name}: listo (${Math.round(bytes.length / 1024)} KB)\n`);
}
