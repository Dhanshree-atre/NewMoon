/**
 * PrivateAirdrop — browser private witnesses.
 *
 * This file is the ONLY place that reasons about private user data in the
 * browser: the participant's eligibility secret, salt and one-time code, and
 * the admin's secret key. The values are derived deterministically from the
 * wallet's shielded-coin public key (a stable per-wallet identity) and the
 * public campaign id, so registration and claim produce the SAME commitment
 * and nullifier without ever persisting the secret.
 *
 * Everything here is consumed inside the ZK circuits as private witnesses and
 * is never written to the ledger, never logged, and never rendered.
 */
import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { Ledger } from './managed/private-airdrop/contract/index.js';

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
  return sha256(concatBytes(textEncoder.encode('private-airdrop:salt:'), campaignId, identity));
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
