// Site and admin on one localhost: the admin's Vite server on :5175 (base /admin/) and the Astro site on :4322,
// whose dev server passes /admin/ through to it (astro.config.mjs). Open http://localhost:4322/ and /admin/.
// Ctrl+C stops both.
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// A run that was killed hard can leave its servers behind ("Port 5175 is already in use"): stop this project's own
// leftover dev servers on our ports first. Anything else on those ports is left alone (the start then fails clearly).
for (const port of [5175, 4322]) {
  let pids = [];
  try {
    pids = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    /* port free */
  }
  for (const pid of pids) {
    const cmd = execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8' });
    if (cmd.includes(root) && /vite|astro/.test(cmd)) {
      console.log(`[dev-all] stopping a leftover server on :${port} (pid ${pid})`);
      process.kill(Number(pid), 'SIGTERM');
    }
  }
}
await new Promise((r) => setTimeout(r, 400));
const run = (name, args, cwd) => {
  const p = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: true });
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
  // each child runs in its own process group: stop npm and the server it started
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
