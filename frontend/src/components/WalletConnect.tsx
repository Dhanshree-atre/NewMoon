import { useState } from 'react';
import { useAirdrop, type WalletStatus } from '../contexts/AirdropContext.js';

const STATUS_LABEL: Record<WalletStatus, string> = {
  idle: 'Wallet not connected',
  checking: 'Looking for Midnight Lace wallet…',
  'not-found': 'Wallet not found',
  connecting: 'Connecting to network…',
  connected: 'Wallet connected',
  error: 'Connection failed',
};

const CopyField = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    });
  };
  return (
    <div className="address-field">
      <p className="muted small">
        {label}: <code className="address">{value}</code>
      </p>
      <button className="btn btn-small" type="button" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
};

export const WalletConnect = () => {
  const { status, error, walletIdentityHex, shieldedAddress, connect, busy } = useAirdrop();
  const connected = status === 'connected';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className={`dot ${connected ? 'dot-ok' : 'dot-warn'}`} />
        <span>{STATUS_LABEL[status]}</span>
      </div>
      {status === 'connecting' && (
        <p className="muted small">
          Approve the connection request that pops up in your Midnight Lace wallet. If nothing pops up,
          click the Lace extension icon and approve the connection there.
        </p>
      )}
      {!connected && status !== 'error' && (
        <button className="btn" onClick={() => void connect()} disabled={busy !== null}>
          Connect Midnight Lace wallet
        </button>
      )}
      {status === 'error' && error && <p className="error">{error}</p>}
      {connected && shieldedAddress && (
        <CopyField
          value={shieldedAddress}
          label="Wallet address (use this to claim testnet tokens from the faucet)"
        />
      )}
      {connected && walletIdentityHex && (
        <p className="muted small">
          Wallet identity (shielded coin public key): <code>{walletIdentityHex.slice(0, 12)}…{walletIdentityHex.slice(-8)}</code>
        </p>
      )}
    </div>
  );
};
