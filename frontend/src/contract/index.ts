/**
 * PrivateAirdrop — compiled contract glue for the browser.
 *
 * ZK artifacts (prover/verifier keys, zkir) are served as static assets under
 * `${origin}/zk` and fetched over HTTP by FetchZkConfigProvider.
 */
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from './managed/private-airdrop/contract/index.js';
import { witnesses } from './witnesses.js';

export const AirdropPrivateStateKey = 'privateAirdropPrivateState';

/** Base URL from which ZK artifacts are served. */
export const zkConfigBaseUrl = `${window.location.origin}/zk`;

export const CompiledPrivateAirdropContract = CompiledContract.make(
  'private-airdrop',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigBaseUrl),
);

export * from './managed/private-airdrop/contract/index.js';
