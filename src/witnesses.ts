/**
 * PrivateAirdrop — private witnesses (the PRIVATE side of the contract).
 *
 * This file is the ONLY place that reasons about private user data:
 *  - the participant's eligibility secret, salt and one-time code;
 *  - the admin's secret key.
 *
 * These values are fed into the zero-knowledge circuits as witnesses and are
 * NEVER written to the ledger, NEVER logged, and NEVER rendered. They live only
 * in the contract's private state provider (encrypted at rest by Midnight.js,
 * in memory in the browser) and are used once to build a proof.
 */

import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { Ledger } from '../contracts/managed/private-airdrop/contract/index.js';

export interface AirdropPrivateState {
  /** Admin secret key — used by the deploy/admin circuits only. */
  adminSk: Uint8Array;
  /** Participant eligibility secret (private witness). */
  secret: Uint8Array;
  /** Participant blinding salt (private witness). */
  salt: Uint8Array;
  /** Participant one-time registration code (private witness). */
  code: Uint8Array;
}

export const createAirdropPrivateState = (
  adminSk: Uint8Array,
  secret: Uint8Array,
  salt: Uint8Array,
  code: Uint8Array,
): AirdropPrivateState => ({ adminSk, secret, salt, code });

export const emptyAirdropPrivateState = (adminSk: Uint8Array): AirdropPrivateState =>
  createAirdropPrivateState(adminSk, new Uint8Array(32), new Uint8Array(32), new Uint8Array(32));

/**
 * Witness implementations. Each witness returns the (possibly updated) private
 * state plus the value the circuit needs. The value becomes part of the ZK
 * proof only — never public data.
 */
export const witnesses = {
  localAdminSk: ({ privateState }: WitnessContext<Ledger, AirdropPrivateState>): [
    AirdropPrivateState,
    Uint8Array,
  ] => [privateState, privateState.adminSk],

  localSecret: ({ privateState }: WitnessContext<Ledger, AirdropPrivateState>): [
    AirdropPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secret],

  localSalt: ({ privateState }: WitnessContext<Ledger, AirdropPrivateState>): [
    AirdropPrivateState,
    Uint8Array,
  ] => [privateState, privateState.salt],

  localCode: ({ privateState }: WitnessContext<Ledger, AirdropPrivateState>): [
    AirdropPrivateState,
    Uint8Array,
  ] => [privateState, privateState.code],
};

// ─── Deterministic private-witness derivation ─────────────────────────────────
//
// The participant's secret and salt are derived deterministically from a
// private identity (e.g. the wallet seed in Node scripts, the wallet's
// shielded coin public key in the browser) and the public campaign id. This
// means:
//
//   * registration and claim produce the SAME commitment without ever storing
//     the secret on disk or in the browser; and
//   * the values are regenerated at runtime, used inside the proof, and then
//     dropped — they are never persisted by the application itself.

const textEncoder = new TextEncoder();

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return new Uint8Array(digest);
}

export async function deriveAdminSecretKey(identity: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(textEncoder.encode('private-airdrop:admin:'), identity));
}

export async function deriveParticipantSecret(identity: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(textEncoder.encode('private-airdrop:secret:'), identity));
}

export async function deriveParticipantSalt(
  identity: Uint8Array,
  campaignId: Uint8Array,
): Promise<Uint8Array> {
  return sha256(
    concatBytes(textEncoder.encode('private-airdrop:salt:'), campaignId, identity),
  );
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ─── Hex helpers (for public data only — never for secrets) ──────────────────

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
