import { describe, it, expect } from 'vitest';
import { base64url, createPkcePair } from '../oauth-pkce.js';

const B64URL = /^[A-Za-z0-9_-]+$/;

describe('base64url', () => {
  it('encodes bytes to URL-safe base64 with padding stripped', () => {
    expect(base64url(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(base64url(new Uint8Array([255, 255, 255]))).toBe('____'); // '/' → '_'
    expect(base64url(new Uint8Array([0]))).toBe('AA'); // '==' padding removed
  });
  it('never emits +, /, or =', () => {
    const out = base64url(new Uint8Array([251, 239, 190, 255, 0, 16]));
    expect(out).not.toMatch(/[+/=]/);
    expect(out).toMatch(B64URL);
  });
});

describe('createPkcePair', () => {
  it('returns url-safe verifier / challenge / state of the right sizes', async () => {
    const { verifier, challenge, state } = await createPkcePair();
    for (const v of [verifier, challenge, state]) expect(v).toMatch(B64URL);
    expect(verifier).toHaveLength(43); // 32 random bytes
    expect(challenge).toHaveLength(43); // SHA-256 digest = 32 bytes
    expect(state).toHaveLength(22); // 16 random bytes
  });

  it('produces a real S256 challenge = base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await createPkcePair();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(base64url(new Uint8Array(digest)));
  });

  it('is random — two pairs differ', async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });
});
