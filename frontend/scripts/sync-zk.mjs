/**
 * Sync the compiled Compact contract into the frontend so it is fully
 * self-contained for Vercel/Netlify deploys:
 *
 *   contracts/managed/private-airdrop/keys      → public/zk/keys
 *   contracts/managed/private-airdrop/zkir      → public/zk/zkir
 *   contracts/managed/private-airdrop/contract  → src/contract/managed/private-airdrop/contract
 *
 * The browser loads prover/verifier keys and zkir over HTTP (FetchZkConfigProvider
 * with baseURL `${origin}/zk`), so they must be served as static assets.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(frontendDir, '..');
const managed = path.join(repoDir, 'contracts', 'managed', 'private-airdrop');

const targets = [
  { src: 'keys', dest: path.join(frontendDir, 'public', 'zk', 'keys') },
  { src: 'zkir', dest: path.join(frontendDir, 'public', 'zk', 'zkir') },
  { src: 'contract', dest: path.join(frontendDir, 'src', 'contract', 'managed', 'private-airdrop', 'contract') },
];

if (!fs.existsSync(managed)) {
  console.error('Compiled contract not found. Run `npm run compile` in the repo root first.');
  process.exit(1);
}

for (const { src, dest } of targets) {
  const srcPath = path.join(managed, src);
  if (!fs.existsSync(srcPath)) {
    console.error(`Missing compiled output: ${srcPath}`);
    process.exit(1);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(srcPath, dest, { recursive: true });
  console.log(`  synced ${src} → ${path.relative(frontendDir, dest)}`);
}

console.log('Frontend ZK artifacts synced.');
