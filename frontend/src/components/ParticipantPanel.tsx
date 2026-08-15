import { useState, type FormEvent } from 'react';
import { useAirdrop } from '../contexts/AirdropContext.js';
import type { AirdropAPI, AirdropView } from '../api/index.js';

const n = (v: bigint | number): string => v.toString();
const pct = (part: bigint, whole: bigint): string =>
  whole > 0n ? ((Number(part) / Number(whole)) * 100).toFixed(0) : '0';

export const ParticipantPanel = ({ view, api }: { view: AirdropView | null; api: AirdropAPI }) => {
  const { runAction, busy } = useAirdrop();
  const [code, setCode] = useState('');
  const [lastCheck, setLastCheck] = useState<boolean | null>(null);

  return (
    <div className="panel">
      <h3>Campaign</h3>
      {!view && <p className="muted">Waiting for campaign state…</p>}
      {view && (
        <>
          <p>
            <strong>{view.campaignName}</strong>{' '}
            <span className={`badge ${view.status === 'ACTIVE' ? 'badge-ok' : 'badge-closed'}`}>{view.status}</span>
          </p>
          <dl className="stats">
            <div>
              <dt>Reward per claim</dt>
              <dd>{n(view.rewardPerClaim)}</dd>
            </div>
            <div>
              <dt>Claims taken</dt>
              <dd>{n(view.claimedCount)} / {n(view.maxClaims)}</dd>
            </div>
            <div>
              <dt>Eligible</dt>
              <dd>{n(view.eligibleCount)}</dd>
            </div>
            <div>
              <dt>Codes left</dt>
              <dd>{n(view.codesLeft)}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{pct(view.claimedCount, view.maxClaims)}%</dd>
            </div>
          </dl>
          <p className="muted small">Campaign id: <code>{view.campaignIdHex.slice(0, 12)}…{view.campaignIdHex.slice(-8)}</code></p>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code;
              setCode('');
              void runAction('Registering eligibility…', async () => {
                await api.registerEligibility(c);
                setLastCheck(null);
              });
            }}
          >
            <h4>Register as eligible</h4>
            <p className="muted small">
              Proved without revealing your input: only a <em>commitment hash</em> of your identity
              and one-time code is added to the ledger.
            </p>
            <label>
              Your one-time code (32 bytes / 64 hex chars)
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                placeholder="0123…abcd (64 hex chars)"
                spellCheck={false}
              />
            </label>
            <button className="btn" type="submit" disabled={code.length !== 64 || view.status !== 'ACTIVE' || busy !== null}>
              Register
            </button>
          </form>

          <button
            className="btn"
            disabled={view.status !== 'ACTIVE' || busy !== null}
            onClick={() =>
              void runAction('Claiming reward…', async () => {
                await api.claim();
                setLastCheck(null);
              })
            }
          >
            Claim reward
          </button>

          <button
            className="btn btn-ghost"
            disabled={view.status !== 'ACTIVE' || busy !== null}
            onClick={() =>
              void runAction('Verifying claim…', async () => {
                setLastCheck(await api.verifyClaim());
              })
            }
          >
            Verify my claim
          </button>
          {lastCheck !== null && (
            <p className={lastCheck ? 'ok' : 'error'}>
              {lastCheck ? 'Your claim is verified on-chain.' : 'No claim found for this wallet.'}
            </p>
          )}
        </>
      )}
    </div>
  );
};
