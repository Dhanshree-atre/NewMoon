import { useState, type FormEvent } from 'react';
import { useAirdrop } from '../contexts/AirdropContext.js';
import type { AirdropAPI, AirdropView } from '../api/index.js';

const randomHex32 = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const DeployedAddress = ({ address }: { address: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    });
  };
  return (
    <div className="deployed">
      <h3>Contract deployed</h3>
      <p className="muted small">
        Contract address (set this as <code>VITE_CONTRACT_ADDRESS</code> in <code>frontend/.env.local</code>{' '}
        so the app auto-joins this campaign on reload):
      </p>
      <code className="address">{address}</code>
      <button className="btn" type="button" onClick={copy}>
        {copied ? 'Copied!' : 'Copy address'}
      </button>
    </div>
  );
};

const CreateCampaignForm = ({ onCreate }: { onCreate: (spec: { name: string; campaignIdHex: string; rewardPerClaim: bigint; maxClaims: bigint }) => void }) => {
  const { busy } = useAirdrop();
  const [name, setName] = useState('');
  const [reward, setReward] = useState('1000');
  const [maxClaims, setMaxClaims] = useState('100');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate({
      name: name.trim() || 'PrivateAirdrop Campaign',
      campaignIdHex: randomHex32(),
      rewardPerClaim: BigInt(reward.trim() || '0'),
      maxClaims: BigInt(maxClaims.trim() || '0'),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <h3>Create a new campaign</h3>
      <p className="muted">No contract address is configured, so the admin deploys a new campaign from here.</p>
      <label>
        Campaign name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Midnight Season Rewards" />
      </label>
      <label>
        Reward per claim
        <input value={reward} onChange={(e) => setReward(e.target.value)} type="number" min="0" step="1" />
      </label>
      <label>
        Max claims
        <input value={maxClaims} onChange={(e) => setMaxClaims(e.target.value)} type="number" min="1" step="1" />
      </label>
      <p className="muted small">A random 32-byte campaign id is generated client-side.</p>
      <button className="btn" type="submit" disabled={busy !== null}>
        Deploy campaign
      </button>
    </form>
  );
};

const AdminActions = ({ view, api }: { view: AirdropView; api: AirdropAPI }) => {
  const { runAction, busy } = useAirdrop();
  const [code, setCode] = useState('');

  return (
    <div>
      {api && <DeployedAddress address={api.deployedContractAddress} />}
      <h3>Admin controls</h3>
      <p className="muted small">
        Admin public key: <code>{view.adminPubKeyHex.slice(0, 12)}…{view.adminPubKeyHex.slice(-8)}</code>
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code;
          setCode('');
          void runAction('Adding eligibility code…', () => api.adminAddCode(c));
        }}
      >
        <label>
          Add one-time eligibility code (32 bytes / 64 hex chars)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="0123…abcd (64 hex chars)"
            spellCheck={false}
          />
        </label>
        <button className="btn" type="submit" disabled={code.length !== 64 || busy !== null}>
          Add code
        </button>
      </form>
      <button
        className="btn btn-danger"
        disabled={view.status !== 'ACTIVE' || busy !== null}
        onClick={() => void runAction('Closing campaign…', () => api.closeCampaign())}
      >
        Close campaign
      </button>
    </div>
  );
};

export const AdminPanel = ({ view }: { view: AirdropView | null }) => {
  const { api, createCampaign, busy, error } = useAirdrop();
  const [localError, setLocalError] = useState<string | null>(null);

  const create = (spec: Parameters<typeof createCampaign>[0]) => {
    setLocalError(null);
    createCampaign(spec).catch((e) => setLocalError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="panel">
      {localError && <p className="error">{localError}</p>}
      {!localError && error && <p className="error">{error}</p>}
      {!api && <CreateCampaignForm onCreate={create} />}
      {api && view && <AdminActions view={view} api={api} />}
      {api && !view && <p className="muted">Waiting for campaign state…</p>}
      {busy && <p className="muted small">{busy}</p>}
    </div>
  );
};
