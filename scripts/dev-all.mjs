// Site and admin on one localhost: the admin's Vite server on :5175 (base /admin/) and the Astro site on :4322,
// whose dev server passes /admin/ through to it (astro.config.mjs). Open http://localhost:4322/ and /admin/.
// Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (name, args, cwd) => {
  const p = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = (chunk) => chunk.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (c) => process.stdout.write(tag(c)));
  p.stderr.on('data', (c) => process.stderr.write(tag(c)));
  p.on('exit', (code) => {
    console.log(`[${name}] stopped (${code ?? 'signal'})`);
    stop();
  });
  return p;
};

const procs = [
  run('admin', ['run', 'dev', '--', '--port', '5175', '--strictPort'], `${root}admin`),
  run('site', ['run', 'dev', '--', '--port', '4322', ...process.argv.slice(2)], root),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
