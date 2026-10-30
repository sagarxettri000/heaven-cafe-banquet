// Starts `wrangler dev` with the local D1 state kept in the OS temp directory.
//
// Wrangler's default state path lives inside the project (.wrangler/state). Miniflare
// appends a deep path of its own, and on Windows a checkout nested in a long directory
// pushes that past the 260-character MAX_PATH limit — the database then fails to open
// and every query returns "internal error". A short, project-external path avoids it.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = join(tmpdir(), 'heaven-cafe-banquet-dev');

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1', '--persist-to', state],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
