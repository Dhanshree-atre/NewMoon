import { useAirdrop, type WalletStatus } from '../contexts/AirdropContext.js';

const STATUS_LABEL: Record<WalletStatus, string> = {
  idle: 'Wallet not connected',
  checking: 'Looking for Midnight Lace wallet…',
  'not-found': 'Wallet not found',
  connecting: 'Connecting to network…',
  connected: 'Wallet connected',
  error: 'Connection failed',
};

export const WalletConnect = () => {
  const { status, error, walletIdentityHex, connect, busy } = useAirdrop();
  const connected = status === 'connected';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className={`dot ${connected ? 'dot-ok' : 'dot-warn'}`} />
        <span>{STATUS_LABEL[status]}</span>
      </div>
      {!connected && status !== 'error' && (
        <button className="btn" onClick={() => void connect()} disabled={busy !== null}>
          Connect Midnight Lace wallet
        </button>
      )}
      {status === 'error' && error && <p className="error">{error}</p>}
      {connected && walletIdentityHex && (
        <p className="muted small">
          Wallet identity (shielded coin public key): <code>{walletIdentityHex.slice(0, 12)}…{walletIdentityHex.slice(-8)}</code>
        </p>
      )}
    </div>
  );
};
