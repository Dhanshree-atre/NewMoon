/**
 * PrivateAirdrop — browser API over the deployed contract.
 *
 * The API adapts a deployed PrivateAirdrop contract for the React UI:
 *   * `state$` streams the PUBLIC ledger view from the indexer;
 *   * every mutating action builds a zero-knowledge proof in the browser (or
 *     via the wallet's prover), balances it with the wallet, and submits it.
 *
 * Privacy contract: the admin key, participant secret, salt and one-time code
 * are held only inside the private-state provider for the duration of each
 * proof and are never written, logged, or rendered.
 */
import { BehaviorSubject, combineLatest, firstValueFrom, map, type Observable } from 'rxjs';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CampaignStatus } from '../contract/index.js';
import { AirdropPrivateStateKey } from '../contract/index.js';
import { pureCircuits, ledger as ledgerView } from '../contract/index.js';
import { CompiledPrivateAirdropContract } from '../contract/index.js';
import type { DeployedAirdropContract, AirdropProviders } from './common-types.js';
import {
  createAirdropPrivateState,
  deriveAdminSecretKey,
  deriveParticipantSecret,
  deriveParticipantSalt,
  fromHex,
  toHex,
  type AirdropPrivateState,
} from '../contract/witnesses.js';

const EMPTY32 = new Uint8Array(32);

export interface CampaignSpec {
  name: string;
  campaignIdHex: string;
  rewardPerClaim: bigint;
  maxClaims: bigint;
}

/** Public, UI-friendly projection of the campaign ledger. */
export interface AirdropView {
  readonly campaignName: string;
  readonly campaignIdHex: string;
  readonly adminPubKeyHex: string;
  readonly status: 'ACTIVE' | 'CLOSED';
  readonly rewardPerClaim: bigint;
  readonly maxClaims: bigint;
  readonly totalClaims: bigint;
  readonly eligibleCount: bigint;
  readonly codesLeft: bigint;
  readonly claimedCount: bigint;
  readonly nullifierCount: bigint;
  readonly lastVerificationResult: boolean;
}

export class AirdropAPI {
  private readonly addressSubject: BehaviorSubject<string | null>;

  private constructor(
    private readonly providers: AirdropProviders,
    private readonly walletIdentity: Uint8Array,
    private readonly contractAddress: string,
    private readonly deployed: DeployedAirdropContract,
  ) {
    providers.privateStateProvider.setContractAddress(contractAddress);
    this.addressSubject = new BehaviorSubject<string | null>(contractAddress);

    this.state$ = combineLatest([
      this.addressSubject,
      providers.publicDataProvider.contractStateObservable(contractAddress, { type: 'latest' }),
    ]).pipe(
      map(([, contractState]) => {
        if (!contractState) return null;
        const l = ledgerView(contractState.data);
        return {
          campaignName: l.campaignName,
          campaignIdHex: toHex(l.campaignId),
          adminPubKeyHex: toHex(l.adminPubKey),
          status: l.status === CampaignStatus.ACTIVE ? 'ACTIVE' : 'CLOSED',
          rewardPerClaim: l.rewardPerClaim,
          maxClaims: l.maxClaims,
          totalClaims: l.totalClaims,
          eligibleCount: l.eligibilityList.size(),
          codesLeft: l.authorizedCodes.size(),
          claimedCount: l.claimedList.size(),
          nullifierCount: l.nullifierLog.size(),
          lastVerificationResult: l.lastVerificationResult,
        } satisfies AirdropView;
      }),
    );
  }

  /** Observable of the campaign's PUBLIC state (null until the indexer responds). */
  readonly state$: Observable<AirdropView | null>;

  get deployedContractAddress(): string {
    return this.contractAddress;
  }

  /** Current campaign id (public) — needed to derive per-campaign witnesses. */
  private async currentLedger(): Promise<ReturnType<typeof ledgerView>> {
    const state = await firstValueFrom(
      this.providers.publicDataProvider.contractStateObservable(this.contractAddress, { type: 'latest' }),
    );
    if (!state) throw new Error('Campaign state not yet available from the indexer.');
    return ledgerView(state.data);
  }

  private async adminState(): Promise<AirdropPrivateState> {
    const adminSk = await deriveAdminSecretKey(this.walletIdentity);
    return createAirdropPrivateState(adminSk, EMPTY32, EMPTY32, EMPTY32);
  }

  private async participantState(code?: Uint8Array): Promise<AirdropPrivateState> {
    const l = await this.currentLedger();
    const secret = await deriveParticipantSecret(this.walletIdentity);
    const salt = await deriveParticipantSalt(this.walletIdentity, l.campaignId);
    return createAirdropPrivateState(EMPTY32, secret, salt, code ?? EMPTY32);
  }

  private async submit(ps: AirdropPrivateState, circuit: keyof DeployedAirdropContract['callTx'], args: unknown[] = []): Promise<void> {
    await this.providers.privateStateProvider.set(AirdropPrivateStateKey, ps);
    const call = (this.deployed.callTx as any)[circuit] as (...a: unknown[]) => Promise<unknown>;
    await call(...args);
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  async adminAddCode(codeHex: string): Promise<void> {
    const code = fromHex(codeHex);
    if (code.length !== 32) throw new Error('Code must be 32 bytes (64 hex chars).');
    // Only H(code) is published; the raw code never leaves this call.
    await this.submit(await this.adminState(), 'adminAddCode', [code]);
  }

  async closeCampaign(): Promise<void> {
    await this.submit(await this.adminState(), 'closeCampaign');
  }

  // ── Participant actions ────────────────────────────────────────────────────

  async registerEligibility(codeHex: string): Promise<void> {
    const code = fromHex(codeHex);
    if (code.length !== 32) throw new Error('Code must be 32 bytes (64 hex chars).');
    // Proved without revealing your input: only your commitment hash is published.
    await this.submit(await this.participantState(code), 'registerEligibility');
  }

  async claim(): Promise<void> {
    // Proved without revealing your input: only your nullifier is published.
    await this.submit(await this.participantState(), 'claim');
  }

  async verifyClaim(): Promise<boolean> {
    const l = await this.currentLedger();
    const secret = await deriveParticipantSecret(this.walletIdentity);
    const nullifier = pureCircuits.computeNullifier(secret, l.campaignId);
    const ps = createAirdropPrivateState(EMPTY32, secret, EMPTY32, EMPTY32);
    await this.submit(ps, 'verifyClaim', [nullifier]);
    const after = await this.currentLedger();
    return after.lastVerificationResult;
  }

  // ── Deploy / join ──────────────────────────────────────────────────────────

  static async deploy(
    providers: AirdropProviders,
    walletIdentityHex: string,
    spec: CampaignSpec,
  ): Promise<AirdropAPI> {
    const walletIdentity = fromHex(walletIdentityHex);
    const adminSk = await deriveAdminSecretKey(walletIdentity);
    const campaignId = fromHex(spec.campaignIdHex);
    if (campaignId.length !== 32) throw new Error('campaignIdHex must be 32 bytes (64 hex chars).');

    const deployed = await deployContract(providers, {
      compiledContract: CompiledPrivateAirdropContract,
      args: [spec.name, campaignId, spec.rewardPerClaim, spec.maxClaims],
      privateStateId: AirdropPrivateStateKey,
      initialPrivateState: createAirdropPrivateState(adminSk, EMPTY32, EMPTY32, EMPTY32),
    });

    return new AirdropAPI(
      providers,
      walletIdentity,
      deployed.deployTxData.public.contractAddress,
      deployed as unknown as DeployedAirdropContract,
    );
  }

  static async join(
    providers: AirdropProviders,
    walletIdentityHex: string,
    contractAddress: string,
  ): Promise<AirdropAPI> {
    const walletIdentity = fromHex(walletIdentityHex);
    const deployed = await findDeployedContract(providers, {
      compiledContract: CompiledPrivateAirdropContract,
      contractAddress,
      privateStateId: AirdropPrivateStateKey,
      initialPrivateState: createAirdropPrivateState(EMPTY32, EMPTY32, EMPTY32, EMPTY32),
    });
    return new AirdropAPI(providers, walletIdentity, contractAddress, deployed as unknown as DeployedAirdropContract);
  }
}

/** Re-export hex helpers used by the UI. */
export { toHex, fromHex };
