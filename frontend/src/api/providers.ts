/**
 * PrivateAirdrop — browser wallet & provider bootstrap.
 *
 * Mirrors the Midnight bboard UI pattern: detect the DApp Connector (Midnight
 * Lace) wallet, connect to the chosen network, and assemble the Midnight.js
 * provider set from the wallet's configuration.
 */
import semver from 'semver';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  fromHex,
  toHex,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Transaction,
  type SignatureEnabled,
  type Proof,
  type Binding,
  type FinalizedTransaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider.js';
import { zkConfigBaseUrl, AirdropPrivateStateKey } from '../contract/index.js';
import type { AirdropCircuitKeys, AirdropPrivateStateProvider, AirdropProviders } from './common-types.js';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

const listCompatibleWallets = (): Array<{ name: string; api: InitialAPI }> => {
  if (!window.midnight) return [];
  return Object.entries(window.midnight)
    .filter(
      (entry): entry is [string, InitialAPI] =>
        !!entry[1] &&
        typeof entry[1] === 'object' &&
        'apiVersion' in entry[1] &&
        semver.satisfies(entry[1].apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
    )
    .map(([name, api]) => ({ name, api }));
};

/** Human-readable description of every wallet injected into the page (for diagnostics). */
const describeWallets = (): string => {
  if (!window.midnight || Object.keys(window.midnight).length === 0) {
    return 'no wallets injected into window.midnight';
  }
  return Object.entries(window.midnight)
    .map(([name, api]) => {
      const version =
        api && typeof api === 'object' && 'apiVersion' in api
          ? String((api as InitialAPI).apiVersion)
          : 'unknown';
      return `${name} (apiVersion ${version})`;
    })
    .join(', ');
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const withTimeout = <T>(p: Promise<T>, ms: number, onTimeout: () => string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(onTimeout())), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

/**
 * Wait for the Midnight Lace wallet, then connect to the network.
 *
 * Tries every detected compatible wallet in turn (some browsers inject more
 * than one provider); each attempt is bounded by its own timeout so one hung
 * wallet cannot block the app.
 */
export const connectToWallet = async (networkId: string): Promise<ConnectedAPI> => {
  let wallets = listCompatibleWallets();
  const discoveryDeadline = Date.now() + 3_000;
  while (wallets.length === 0 && Date.now() < discoveryDeadline) {
    await sleep(100);
    wallets = listCompatibleWallets();
  }

  if (wallets.length === 0) {
    throw new Error(`Could not find Midnight Lace wallet (${describeWallets()}).`);
  }

  const failures: string[] = [];
  for (const { name, api } of wallets) {
    try {
      console.debug(`[PrivateAirdrop] Connecting wallet ${name} (apiVersion ${api.apiVersion})...`);
      return await withTimeout(
        api.connect(networkId),
        30_000,
        () => `${name} did not respond within 30s`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${msg}`);
      console.warn(`[PrivateAirdrop] Wallet ${name} connect failed:`, error);
    }
  }

  const mismatch = failures.find((f) => /network mismatch|network.*switch/i.test(f));
  if (mismatch) {
    throw new Error(
      `Network mismatch: your wallet is on a different network than the app (${networkId}). ` +
        `Switch your wallet network to "${networkId}" in the 1AM extension ` +
        '(or set VITE_NETWORK_ID in frontend/.env.local to match your wallet), then try again.',
    );
  }

  throw new Error(
    `Midnight Lace wallet did not respond. Tried ${failures.length} wallet(s): ${failures.join('; ')}. ` +
      'Approve the connection request in the wallet extension — if no popup appears, click the ' +
      'Lace extension icon and approve the connection to this site.',
  );
};

/** Assembles the provider set from a connected wallet. */
export const initializeProviders = async (
  connectedAPI: ConnectedAPI,
  networkId: string,
  contractAddress?: string,
): Promise<AirdropProviders> => {
  setNetworkId(networkId);

  const keyMaterialProvider = new FetchZkConfigProvider<AirdropCircuitKeys>(
    zkConfigBaseUrl,
    fetch.bind(window),
  );

  const config = await connectedAPI.getConfiguration();

  // Allow explicit indexer overrides (e.g. for a custom deployment).
  const indexerUri = import.meta.env.VITE_INDEXER_URL || config.indexerUri;
  const indexerWsUri = import.meta.env.VITE_INDEXER_WS_URL || config.indexerWsUri;

  const privateStateProvider = inMemoryPrivateStateProvider<
    typeof AirdropPrivateStateKey,
    import('../contract/witnesses.js').AirdropPrivateState
  >();
  if (contractAddress) {
    (privateStateProvider as AirdropPrivateStateProvider).setContractAddress(contractAddress);
  }

  const shieldedAddresses = await connectedAPI.getShieldedAddresses();

  return {
    privateStateProvider: privateStateProvider as AirdropPrivateStateProvider,
    zkConfigProvider: keyMaterialProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri!, keyMaterialProvider),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
    walletProvider: {
      getCoinPublicKey(): string {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey(): string {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      balanceTx: async (tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> => {
        const serializedTx = toHex(tx.serialize());
        const received = await connectedAPI.balanceUnsealedTransaction(serializedTx);
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(received.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        const txId = tx.identifiers()[0];
        return txId;
      },
    },
  };
};
