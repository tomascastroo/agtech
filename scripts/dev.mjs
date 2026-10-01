// Desarrollo local: API, worker, frontend y servicio de visión en paralelo, con el .env raíz.
// Requiere la infraestructura levantada (pnpm infra:up) y la base inicializada (pnpm db:bootstrap).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const services = [
  ['api', 'pnpm', ['--filter', '@agrogarantias/api', 'dev']],
  ['worker', 'pnpm', ['--filter', '@agrogarantias/api', 'dev:worker']],
  ['web', 'pnpm', ['--filter', '@agrogarantias/web', 'dev']],
  ['ai', 'uv', ['run', '--directory', 'apps/ai-service', 'uvicorn', 'agro_vision.main:app', '--reload', '--port', '8000']],
];

const children = services.map(([name, command, args]) => {
  const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}]`.padEnd(9);
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(`${prefix}${line}\n`);
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}finalizó (código ${code})\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
