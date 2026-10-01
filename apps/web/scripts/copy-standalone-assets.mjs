// Next.js "standalone" does not include public/ or .next/static: they are copied next to server.js.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.next/standalone/apps/web');
if (!existsSync(target)) {
  throw new Error('No existe .next/standalone: ejecutá "next build" primero');
}
cpSync(join(root, '.next/static'), join(target, '.next/static'), { recursive: true });
if (existsSync(join(root, 'public')))
  cpSync(join(root, 'public'), join(target, 'public'), { recursive: true });
