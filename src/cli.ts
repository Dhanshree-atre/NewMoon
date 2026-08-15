/**
 * CLI for interacting with the deployed PrivateAirdrop contract.
 *
 * Flows:
 *   Admin:       add a one-time registration code (only its hash is published),
 *                close the campaign
 *   Participant: register eligibility (paste a code), claim, verify your own
 *                claim, read the campaign's PUBLIC state
 *
 * Privacy note: every secret (admin key, eligibility secret, salt, code) is
 * derived at runtime from the wallet seed and lives only inside the ZK proof
 * built for each transaction. Only PUBLIC ledger data (hashes, counts, status)
 * is ever printed. The raw code is shared out-of-band with the eligible
 * participant and never appears on-chain.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from './network';
import { createWallet, persistWalletState, type WalletContext } from './wallet';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

import { CompiledPrivateAirdropContract, pureCircuits, ledger as ledgerView, zkConfigPath } from './contract';
import {
  createAirdropPrivateState,
  deriveAdminSecretKey,
  deriveParticipantSecret,
  deriveParticipantSalt,
  fromHex,
} from './witnesses';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'privateAirdropPrivateState';
const EMPTY32 = new Uint8Array(32);

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'private-airdrop-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function readLedger(deployed: any, providers: any) {
  const state = await providers.publicDataProvider.queryContractState(deployed.deployTxData.public.contractAddress);
  return state ? ledgerView(state.data) : null;
}

function printState(l: any) {
  console.log('  ── Campaign (PUBLIC state) ──────────────────────────────────');
  console.log(`  Name:        ${l.campaignName}`);
  console.log(`  ID:          0x${toHex(l.campaignId)}`);
  console.log(`  Admin key:   0x${toHex(l.adminPubKey)}`);
  console.log(`  Status:      ${l.status === 0 ? 'ACTIVE' : 'CLOSED'}`);
  console.log(`  Reward:      ${l.rewardPerClaim}`);
  console.log(`  Max claims:  ${l.maxClaims}`);
  console.log(`  Total claims:${l.totalClaims}`);
  console.log(`  Eligible:    ${l.eligibilityList.size()}`);
  console.log(`  Codes left:  ${l.authorizedCodes.size()}`);
  console.log(`  Claimed:     ${l.claimedList.size()}`);
  console.log(`  Nullifiers:  ${l.nullifierLog.size()}`);
  console.log('  ─────────────────────────────────────────────────────────────\n');
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║            PrivateAirdrop CLI                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract: ${deployment.address}`);
  console.log(`  Network:  ${network}\n`);

  try {
    const identity = Buffer.from(SEED, 'hex');
    const adminSk = await deriveAdminSecretKey(identity);

    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
    }

    console.log('  Syncing with network...\n');
    await walletCtx.wallet.waitForSyncedState();
    await persistWalletState(network, walletCtx);

    console.log('  Connecting to contract...');
    const providers = await createProviders(walletCtx);

    const deployed: any = await findDeployedContract(providers, {
      compiledContract: CompiledPrivateAirdropContract as any,
      contractAddress: deployment.address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: createAirdropPrivateState(adminSk, EMPTY32, EMPTY32, EMPTY32),
    });

    console.log('  ✅ Connected!\n');

    async function submit(circuit: string, ps: any, args: any[] = []) {
      await providers.privateStateProvider.set(PRIVATE_STATE_ID, ps);
      console.log('\n  Proving & submitting transaction (this can take 30-60s)...');
      const tx = await (deployed.callTx as any)[circuit](...args);
      console.log(`  ✅ ${circuit} succeeded!`);
      console.log(`  Transaction ID: ${tx.public.txId ?? tx.public.txHash ?? 'ok'}`);
      console.log(`  Block height: ${tx.public.blockHeight ?? 'n/a'}\n`);
    }

    async function currentCampaign() {
      const l = await readLedger(deployed, providers);
      if (!l) {
        console.log('  (no contract state found)');
        return null;
      }
      return l;
    }

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  ADMIN');
      console.log('  1. Add a registration code (only its hash is published)');
      console.log('  2. Close campaign');
      console.log('  PARTICIPANT');
      console.log('  3. Register eligibility (paste your one-time code)');
      console.log('  4. Claim reward');
      console.log('  5. Verify your claim (recompute your nullifier)');
      console.log('  OTHER');
      console.log('  6. Show campaign (public) state');
      console.log('  7. Exit\n');

      const choice = await rl.question('  Your choice: ');

      switch (choice.trim()) {
        case '1': {
          const rawCode = await rl.question('  Code (32 bytes hex, 64 chars): ');
          const code = fromHex(rawCode.trim());
          if (code.length !== 32) {
            console.error('  ❌ Code must be 64 hex chars.');
            break;
          }
          console.log('  ℹ  Publishing only H(code) — the raw code never reaches the chain.');
          await submit(
            'adminAddCode',
            createAirdropPrivateState(adminSk, EMPTY32, EMPTY32, EMPTY32),
            [code],
          );
          break;
        }

        case '2':
          await submit('closeCampaign', createAirdropPrivateState(adminSk, EMPTY32, EMPTY32, EMPTY32));
          break;

        case '3': {
          const rawCode = await rl.question('  Your one-time code (32 bytes hex, 64 chars): ');
          const code = fromHex(rawCode.trim());
          if (code.length !== 32) {
            console.error('  ❌ Code must be 64 hex chars.');
            break;
          }
          const l = await currentCampaign();
          if (!l) break;
          const secret = await deriveParticipantSecret(identity);
          const salt = await deriveParticipantSalt(identity, l.campaignId);
          console.log('  ℹ  Proved without revealing your input: only your commitment hash is published.');
          await submit('registerEligibility', createAirdropPrivateState(adminSk, secret, salt, code));
          break;
        }

        case '4': {
          const l = await currentCampaign();
          if (!l) break;
          const secret = await deriveParticipantSecret(identity);
          const salt = await deriveParticipantSalt(identity, l.campaignId);
          console.log('  ℹ  Proved without revealing your input: only your nullifier is published.');
          await submit('claim', createAirdropPrivateState(adminSk, secret, salt, EMPTY32));
          break;
        }

        case '5': {
          const l = await currentCampaign();
          if (!l) break;
          const secret = await deriveParticipantSecret(identity);
          const nullifier = pureCircuits.computeNullifier(secret, l.campaignId);
          console.log('  ℹ  Recomputing your nullifier locally, then querying the public claim log.');
          console.log(`  Your nullifier: 0x${toHex(nullifier)}`);
          await submit('verifyClaim', createAirdropPrivateState(adminSk, secret, EMPTY32, EMPTY32), [nullifier]);
          const after = await currentCampaign();
          console.log(`  ✅ Verification result: ${after!.lastVerificationResult ? 'VERIFIED — your claim is on-chain.' : 'NOT VERIFIED — nullifier not found.'}\n`);
          break;
        }

        case '6': {
          const l = await currentCampaign();
          if (l) printState(l);
          break;
        }

        case '7':
          running = false;
          console.log('\n  👋 Goodbye!\n');
          break;

        default:
          console.log('\n  ❌ Invalid choice. Please enter 1-7.\n');
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
