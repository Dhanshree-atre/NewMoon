/**
 * PrivateAirdrop — common browser types.
 */
import type { MidnightProviders, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import type { FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { Contract, Witnesses } from '../contract/index.js';
import { AirdropPrivateStateKey } from '../contract/index.js';
import type { AirdropPrivateState } from '../contract/witnesses.js';

/** The private-state provider returned by the in-memory implementation. */
export type AirdropPrivateStateProvider = PrivateStateProvider<
  typeof AirdropPrivateStateKey,
  AirdropPrivateState
> & {
  setContractAddress(address: string): void;
};

export type AirdropContract = Contract<AirdropPrivateState, Witnesses<AirdropPrivateState>>;

export type AirdropCircuitKeys = Exclude<keyof AirdropContract['impureCircuits'], number | symbol>;

export type AirdropProviders = MidnightProviders<AirdropCircuitKeys, typeof AirdropPrivateStateKey, AirdropPrivateState> & {
  readonly privateStateProvider: AirdropPrivateStateProvider;
};

export type DeployedAirdropContract = FoundContract<AirdropContract>;
