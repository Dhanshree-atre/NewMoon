import { describe, it, expect, beforeEach } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { CampaignStatus, pureCircuits } from '../contracts/managed/private-airdrop/contract/index.js';
import { AirdropSimulator, type CampaignParams } from './private-airdrop-simulator.js';
import { concatBytes } from '../src/witnesses.js';

setNetworkId('undeployed');

// ── Deterministic test actors (32-byte values) ───────────────────────────────
const adminSk = new Uint8Array(32).fill(1);
const campaignId = new Uint8Array(32).fill(7);
const secretA = new Uint8Array(32).fill(0x10);
const saltA = new Uint8Array(32).fill(0x11);
const codeA = new Uint8Array(32).fill(0x41);
const secretB = new Uint8Array(32).fill(0x20);
const saltB = new Uint8Array(32).fill(0x21);
const codeB = new Uint8Array(32).fill(0x42);
const attackerSecret = new Uint8Array(32).fill(0x30);

const params: CampaignParams = {
  name: 'PrivateAirdrop Test',
  campaignId,
  reward: 100n,
  maxClaims: 2n,
};

function makeSim(): AirdropSimulator {
  return new AirdropSimulator(params, adminSk);
}

describe('PrivateAirdrop smart contract', () => {
  describe('deployment (createCampaign constructor)', () => {
    it('initialises the public campaign correctly', () => {
      const sim = makeSim();
      const l = sim.getLedger();
      expect(l.campaignName).toBe('PrivateAirdrop Test');
      expect(l.campaignId).toEqual(campaignId);
      expect(l.adminPubKey).toEqual(pureCircuits.getDappPubKey(adminSk));
      expect(l.status).toBe(CampaignStatus.ACTIVE);
      expect(l.rewardPerClaim).toBe(100n);
      expect(l.maxClaims).toBe(2n);
      expect(l.totalClaims).toBe(0n);
      expect(l.eligibilityList.size()).toBe(0n);
      expect(l.authorizedCodes.size()).toBe(0n);
      expect(l.claimedList.size()).toBe(0n);
      expect(l.nullifierLog.size()).toBe(0n);
      expect(l.lastVerificationResult).toBe(false);
    });

    it('publishes only a hash of the admin secret key, never the key itself', () => {
      const sim = makeSim();
      const l = sim.getLedger();
      expect(l.adminPubKey).toEqual(pureCircuits.getDappPubKey(adminSk));
      expect(l.adminPubKey).not.toEqual(adminSk);
    });
  });

  describe('full happy path', () => {
    let sim: AirdropSimulator;
    beforeEach(() => {
      sim = makeSim();
    });

    it('admin adds hashed codes, participants register, claim, verify, admin closes', () => {
      // Admin publishes two one-time registration codes.
      sim.adminAddCode(codeA);
      sim.adminAddCode(codeB);
      let l = sim.getLedger();
      expect(l.authorizedCodes.size()).toBe(2n);
      // Only hashes are stored — raw codes never enter the ledger.
      expect(l.authorizedCodes.member(pureCircuits.computeCodeCommit(codeA))).toBe(true);
      expect(l.authorizedCodes.member(codeA)).toBe(false);

      // Participants register eligibility using their codes.
      sim.registerEligibility(secretA, saltA, codeA);
      sim.registerEligibility(secretB, saltB, codeB);
      l = sim.getLedger();
      expect(l.eligibilityList.size()).toBe(2n);
      expect(l.authorizedCodes.size()).toBe(0n);
      expect(l.eligibilityList.member(pureCircuits.computeCommitment(secretA, saltA))).toBe(true);

      // Participants claim their rewards.
      sim.claim(secretA, saltA);
      l = sim.getLedger();
      expect(l.totalClaims).toBe(1n);
      expect(l.claimedList.size()).toBe(1n);
      expect(l.nullifierLog.size()).toBe(1n);
      expect(l.claimedList.member(pureCircuits.computeCommitment(secretA, saltA))).toBe(true);

      sim.claim(secretB, saltB);
      l = sim.getLedger();
      expect(l.totalClaims).toBe(2n);

      // Anyone can verify a claim by nullifier (selective disclosure).
      sim.verifyClaim(pureCircuits.computeNullifier(secretA, campaignId));
      expect(sim.getLedger().lastVerificationResult).toBe(true);

      // Admin closes the campaign.
      sim.closeCampaign();
      expect(sim.getLedger().status).toBe(CampaignStatus.CLOSED);
    });
  });

  describe('privacy isolation — raw witnesses never reach public data', () => {
    it('ledger contains only one-way hashes; secrets are provably absent', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.adminAddCode(codeB);
      sim.registerEligibility(secretA, saltA, codeA);
      sim.registerEligibility(secretB, saltB, codeB);
      sim.claim(secretA, saltA);
      sim.claim(secretB, saltB);

      const l = sim.getLedger();

      // Every eligibility entry must equal its one-way commitment...
      const commitments = [...l.eligibilityList];
      expect(commitments).toHaveLength(2);
      expect(commitments).toContainEqual(pureCircuits.computeCommitment(secretA, saltA));
      expect(commitments).toContainEqual(pureCircuits.computeCommitment(secretB, saltB));

      // ...every nullifier must equal its one-way nullifier...
      const nullifiers = [...l.nullifierLog];
      expect(nullifiers).toContainEqual(pureCircuits.computeNullifier(secretA, campaignId));
      expect(nullifiers).toContainEqual(pureCircuits.computeNullifier(secretB, campaignId));

      // ...and every stored code must equal its one-way hash.
      const allPublicBytes: Uint8Array[] = [
        l.campaignId,
        l.adminPubKey,
        ...commitments,
        ...[...l.claimedList],
        ...nullifiers,
      ];

      // Raw private witnesses must NEVER appear anywhere in public data.
      const secrets = [secretA, secretB, saltA, saltB, codeA, codeB, adminSk];
      for (const secret of secrets) {
        expect(
          allPublicBytes.some((v) => toHex(v) === toHex(secret)),
          `raw witness ${toHex(secret).slice(0, 16)}… leaked into public data`,
        ).toBe(false);
      }

      // Byte-level scan of the serialised ledger for any secret bytes.
      const ledgerBytes = toHex(
        concatBytes(
          new TextEncoder().encode(l.campaignName),
          ...allPublicBytes.map((b) => b),
        ),
      );
      for (const secret of secrets) {
        expect(ledgerBytes.includes(toHex(secret))).toBe(false);
      }

      // The commitment / nullifier of A must differ from everything B produced.
      const commA = toHex(pureCircuits.computeCommitment(secretA, saltA));
      const commB = toHex(pureCircuits.computeCommitment(secretB, saltB));
      expect(commA).not.toBe(commB);
      expect(commA).not.toBe(toHex(pureCircuits.computeNullifier(secretA, campaignId)));
    });
  });

  describe('replay / double-spend protection', () => {
    it('a one-time code cannot be reused to register twice', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.registerEligibility(secretA, saltA, codeA);
      expect(() => sim.registerEligibility(secretB, saltB, codeA)).toThrow();
    });

    it('an already-registered commitment cannot register again', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.registerEligibility(secretA, saltA, codeA);
      expect(() => sim.registerEligibility(secretA, saltA, codeA)).toThrow();
    });

    it('an already-claimed commitment cannot claim again', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.registerEligibility(secretA, saltA, codeA);
      sim.claim(secretA, saltA);
      expect(() => sim.claim(secretA, saltA)).toThrow();
    });

    it('a second claim after the campaign cap is rejected', () => {
      const sim = new AirdropSimulator({ ...params, maxClaims: 1n }, adminSk);
      sim.adminAddCode(codeA);
      sim.adminAddCode(codeB);
      sim.registerEligibility(secretA, saltA, codeA);
      sim.registerEligibility(secretB, saltB, codeB);
      sim.claim(secretA, saltA);
      expect(() => sim.claim(secretB, saltB)).toThrow();
    });
  });

  describe('authorization & access control', () => {
    it('rejects an unregistered participant (no valid code)', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      // Attacker guesses a code but it is not whitelisted.
      expect(() => sim.registerEligibility(attackerSecret, saltA, codeB)).toThrow();
      // Attacker claims without ever registering.
      expect(() => sim.claim(attackerSecret, saltA)).toThrow();
    });

    it('rejects a duplicate code add by the admin', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      expect(() => sim.adminAddCode(codeA)).toThrow();
    });

    it('rejects registration and claiming after the campaign is closed', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.registerEligibility(secretA, saltA, codeA);
      sim.closeCampaign();
      expect(() => sim.claim(secretA, saltA)).toThrow();
      expect(() => sim.registerEligibility(secretB, saltB, codeB)).toThrow();
    });

    it('rejects a claim whose commitment is not in the eligibility list', () => {
      const sim = makeSim();
      sim.adminAddCode(codeA);
      sim.registerEligibility(secretA, saltA, codeA);
      // Different secret → different commitment → not eligible.
      expect(() => sim.claim(secretB, saltB)).toThrow();
    });
  });

  describe('verification result', () => {
    it('reports false for a nullifier that has never claimed', () => {
      const sim = makeSim();
      sim.verifyClaim(pureCircuits.computeNullifier(secretA, campaignId));
      expect(sim.getLedger().lastVerificationResult).toBe(false);
    });
  });
});
