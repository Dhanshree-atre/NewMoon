/**
 * PrivateAirdrop — compiled contract glue.
 *
 * Re-exports the compiled contract (managed by `compact compile`) together
 * with the private witness implementations so deploy scripts, the CLI and the
 * tests can all use a single typed handle.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { witnesses } from './witnesses.js';
import { Contract } from '../contracts/managed/private-airdrop/contract/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the compiled contract assets (keys + zkir). */
export const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'private-airdrop');

export const CompiledPrivateAirdropContract = CompiledContract.make(
  'PrivateAirdropContract',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

export * from '../contracts/managed/private-airdrop/contract/index.js';
