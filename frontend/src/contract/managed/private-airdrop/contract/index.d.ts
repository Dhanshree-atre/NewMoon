import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum CampaignStatus { ACTIVE = 0, CLOSED = 1 }

export type Witnesses<PS> = {
  localAdminSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localCode(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  adminAddCode(context: __compactRuntime.CircuitContext<PS>, _code_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerEligibility(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  verifyClaim(context: __compactRuntime.CircuitContext<PS>,
              _nullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  adminAddCode(context: __compactRuntime.CircuitContext<PS>, _code_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerEligibility(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  verifyClaim(context: __compactRuntime.CircuitContext<PS>,
              _nullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  computeCommitment(_secret_0: Uint8Array, _salt_0: Uint8Array): Uint8Array;
  computeNullifier(_secret_0: Uint8Array, _campaignId_0: Uint8Array): Uint8Array;
  computeCodeCommit(_code_0: Uint8Array): Uint8Array;
  getDappPubKey(_sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  computeCommitment(context: __compactRuntime.CircuitContext<PS>,
                    _secret_0: Uint8Array,
                    _salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  computeNullifier(context: __compactRuntime.CircuitContext<PS>,
                   _secret_0: Uint8Array,
                   _campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  computeCodeCommit(context: __compactRuntime.CircuitContext<PS>,
                    _code_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  getDappPubKey(context: __compactRuntime.CircuitContext<PS>, _sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  adminAddCode(context: __compactRuntime.CircuitContext<PS>, _code_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  registerEligibility(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  verifyClaim(context: __compactRuntime.CircuitContext<PS>,
              _nullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly campaignName: string;
  readonly campaignId: Uint8Array;
  readonly adminPubKey: Uint8Array;
  readonly status: CampaignStatus;
  readonly rewardPerClaim: bigint;
  readonly maxClaims: bigint;
  readonly totalClaims: bigint;
  eligibilityList: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  authorizedCodes: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  claimedList: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  nullifierLog: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly lastVerificationResult: boolean;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               _name_0: string,
               _campaignId_0: Uint8Array,
               _rewardPerClaim_0: bigint,
               _maxClaims_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
