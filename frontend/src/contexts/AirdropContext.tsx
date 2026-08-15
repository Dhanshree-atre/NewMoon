/**
 * PrivateAirdrop — React context wiring the UI to the wallet and contract API.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AirdropAPI, type CampaignSpec } from '../api/index.js';
import { connectToWallet, initializeProviders } from '../api/providers.js';
import type { AirdropProviders } from '../api/common-types.js';

export type WalletStatus = 'idle' | 'checking' | 'not-found' | 'connecting' | 'connected' | 'error';

export interface AirdropContextValue {
  status: WalletStatus;
  error: string | null;
  api: AirdropAPI | null;
  walletIdentityHex: string | null;
  busy: string | null;
  connect: () => Promise<void>;
  createCampaign: (spec: CampaignSpec) => Promise<void>;
  runAction: (label: string, fn: () => Promise<void>) => Promise<void>;
}

const AirdropContext = createContext<AirdropContextValue | null>(null);

const networkId = import.meta.env.VITE_NETWORK_ID || 'preview';
const envContractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();

export const AirdropProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<WalletStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<AirdropAPI | null>(null);
  const [walletIdentityHex, setWalletIdentityHex] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const providersRef = useRef<AirdropProviders | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('checking');
    try {
      const connectedAPI = await connectToWallet(networkId);
      setStatus('connecting');
      const providers = await initializeProviders(connectedAPI, networkId, envContractAddress);
      providersRef.current = providers;

      const shielded = await connectedAPI.getShieldedAddresses();
      const identityHex = shielded.shieldedCoinPublicKey;
      setWalletIdentityHex(identityHex);

      if (envContractAddress) {
        const joined = await AirdropAPI.join(providers, identityHex, envContractAddress);
        setApi(joined);
      }
      setStatus('connected');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const createCampaign = useCallback(async (spec: CampaignSpec) => {
    const providers = providersRef.current;
    const identityHex = walletIdentityHex;
    if (!providers || !identityHex) {
      setError('Connect your wallet first.');
      return;
    }
    setBusy('Deploying campaign…');
    setError(null);
    try {
      const deployed = await AirdropAPI.deploy(providers, identityHex, spec);
      setApi(deployed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [walletIdentityHex]);

  const runAction = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(null);
    }
  }, []);

  const value = useMemo<AirdropContextValue>(
    () => ({ status, error, api, walletIdentityHex, busy, connect, createCampaign, runAction }),
    [status, error, api, walletIdentityHex, busy, connect, createCampaign, runAction],
  );

  return <AirdropContext.Provider value={value}>{children}</AirdropContext.Provider>;
};

export const useAirdrop = (): AirdropContextValue => {
  const ctx = useContext(AirdropContext);
  if (!ctx) throw new Error('useAirdrop must be used inside AirdropProvider');
  return ctx;
};
