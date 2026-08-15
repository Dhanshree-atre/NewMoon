/**
 * Headless simulator for the PrivateAirdrop contract.
 *
 * Runs the compiled circuits directly against the in-memory Compact runtime —
 * no network, no wallet, no Docker. This is how the bootcamp's tests exercise
 * the contract logic deterministically.
 *
 * Different actors (admin / participants) are simulated by swapping the
 * contract's PRIVATE state before each call: the ledger carries over, while
 * each call proves against the acting caller's private witnesses.
 */
import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../contracts/managed/private-airdrop/contract/index.js';
import { witnesses, type AirdropPrivateState } from '../src/witnesses.js';

export interface CampaignParams {
  name: string;
  campaignId: Uint8Array;
  reward: bigint;
  maxClaims: bigint;
}

const EMPTY32 = new Uint8Array(32);

export class AirdropSimulator {
  readonly contract: Contract<AirdropPrivateState>;
  circuitContext: CircuitContext<AirdropPrivateState>;
  readonly adminSk: Uint8Array;

  constructor(params: CampaignParams, adminSk: Uint8Array) {
    this.adminSk = adminSk;
    this.contract = new Contract<AirdropPrivateState>(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext(
          { adminSk, secret: EMPTY32, salt: EMPTY32, code: EMPTY32 },
          '0'.repeat(64),
        ),
        params.name,
        params.campaignId,
        params.reward,
        params.maxClaims,
      );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  /** Switch the acting private state while keeping the ledger intact. */
  setPrivateState(ps: AirdropPrivateState): void {
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      this.circuitContext.currentZswapLocalState,
      this.circuitContext.currentQueryContext.state,
      ps,
    );
  }

  private asAdmin(): AirdropPrivateState {
    return { adminSk: this.adminSk, secret: EMPTY32, salt: EMPTY32, code: EMPTY32 };
  }

  adminAddCode(code: Uint8Array): Ledger {
    this.setPrivateState(this.asAdmin());
    this.circuitContext = this.contract.impureCircuits.adminAddCode(this.circuitContext, code).context;
    return this.getLedger();
  }

  registerEligibility(secret: Uint8Array, salt: Uint8Array, code: Uint8Array): Ledger {
    this.setPrivateState({ adminSk: EMPTY32, secret, salt, code });
    this.circuitContext = this.contract.impureCircuits.registerEligibility(this.circuitContext).context;
    return this.getLedger();
  }

  claim(secret: Uint8Array, salt: Uint8Array): Ledger {
    this.setPrivateState({ adminSk: EMPTY32, secret, salt, code: EMPTY32 });
    this.circuitContext = this.contract.impureCircuits.claim(this.circuitContext).context;
    return this.getLedger();
  }

  verifyClaim(nullifier: Uint8Array): Ledger {
    this.setPrivateState(this.asAdmin());
    this.circuitContext = this.contract.impureCircuits.verifyClaim(this.circuitContext, nullifier).context;
    return this.getLedger();
  }

  closeCampaign(): Ledger {
    this.setPrivateState(this.asAdmin());
    this.circuitContext = this.contract.impureCircuits.closeCampaign(this.circuitContext).context;
    return this.getLedger();
  }
}
