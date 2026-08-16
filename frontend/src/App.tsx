import { useEffect, useState } from 'react';
import { useAirdrop } from './contexts/AirdropContext.js';
import { WalletConnect } from './components/WalletConnect.js';
import { AdminPanel } from './components/AdminPanel.js';
import { ParticipantPanel } from './components/ParticipantPanel.js';
import type { AirdropView } from './api/index.js';
import './index.css';

export const App = () => {
  const { status, api, error, connect } = useAirdrop();
  const [view, setView] = useState<AirdropView | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!api) {
      setView(null);
      setAddress(null);
      return;
    }
    setAddress(api.deployedContractAddress);
    const sub = api.state$.subscribe(setView);
    return () => sub.unsubscribe();
  }, [api]);

  const connected = status === 'connected';

  return (
    <div className="app">
      <header>
        <h1>PrivateAirdrop</h1>
        <p className="subtitle">Privacy-preserving token eligibility & claims on Midnight</p>
      </header>

      <WalletConnect />

      {error && (
        <p className="error banner">{error}</p>
      )}

      {!connected && (
        <div className="panel">
          <p className="muted">Connect your Midnight Lace wallet to continue. All ZK proofs are built and verified locally in your browser.</p>
          <button className="btn" onClick={() => void connect()}>
            Connect wallet
          </button>
        </div>
      )}

      {connected && (
        <>
          {address && (
            <p className="muted small">
              Contract address: <code>{address}</code>
            </p>
          )}
          <div className="grid">
            <AdminPanel view={view} />
            {api && <ParticipantPanel view={view} api={api} />}
          </div>
        </>
      )}

      <footer className="muted small">
        The admin key, eligibility secret, salt and one-time code never leave your browser — only hashes and
        nullifiers are published to the Midnight ledger.
      </footer>
    </div>
  );
};
