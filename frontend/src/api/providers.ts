/**
 * PrivateAirdrop — browser wallet & provider bootstrap.
 *
 * Mirrors the Midnight bboard UI pattern: detect the DApp Connector (Midnight
 * Lace) wallet, connect to the chosen network, and assemble the Midnight.js
 * provider set from the wallet's configuration.
 */
import semver from 'semver';
import { interval, firstValueFrom, map, filter, take, timeout, throwError, catchError, concatMap, tap } from 'rxjs';
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

const getFirstCompatibleWallet = (): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

/** Waits for the wallet extension, connects to the network, and returns the ConnectedAPI. */
export const connectToWallet = (networkId: string): Promise<ConnectedAPI> =>
  firstValueFrom(
    interval(100).pipe(
      map(() => getFirstCompatibleWallet()),
      filter((connectorAPI): connectorAPI is InitialAPI => !!connectorAPI),
      take(1),
      timeout({
        first: 1_000,
        with: () =>
          throwError(
            () => new Error('Could not find Midnight Lace wallet. Is the extension installed?'),
          ),
      }),
      concatMap(async (initialAPI) => initialAPI.connect(networkId)),
      timeout({
        first: 5_000,
        with: () =>
          throwError(() => new Error('Midnight Lace wallet did not respond. Is it enabled?')),
      }),
      catchError((error) =>
        throwError(() => new Error(`Unable to enable wallet connector API: ${String(error)}`)),
      ),
    ),
  );

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
