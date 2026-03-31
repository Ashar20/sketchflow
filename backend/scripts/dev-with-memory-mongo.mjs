/**
 * Local dev without Docker: starts MongoDB in RAM, seeds SQLite, runs the API.
 * Usage: npm run build && npm run dev:memory
 */
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local'), override: true });

const mem = await MongoMemoryServer.create();
const uri = mem.getUri();
console.log('[dev-with-memory-mongo] In-memory MongoDB:', uri);

const env = { ...process.env, MONGODB_URI: uri };

function runNode(scriptRelative) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, scriptRelative)], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${scriptRelative} exited ${code}`)),
    );
    child.on('error', reject);
  });
}

try {
  await runNode('scripts/dbseedscript.js');
} catch (e) {
  console.error(e);
  await mem.stop();
  process.exit(1);
}

const entry = process.env.DEV_MEMORY_ENTRY || 'dist/index.js';
const app = spawn(process.execPath, [path.join(root, entry)], {
  cwd: root,
  env,
  stdio: 'inherit',
});

async function shutdown(signal) {
  console.log(`[dev-with-memory-mongo] ${signal}`);
  app.kill(signal);
  await mem.stop();
}

app.on('exit', async (code) => {
  await mem.stop();
  process.exit(code ?? 0);
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
