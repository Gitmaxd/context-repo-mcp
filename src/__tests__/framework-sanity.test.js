import { describe, it, expect } from 'vitest';

// Framework sanity: verifies that vitest itself, basic assertion APIs, and
// ESM module loading are wired up correctly. This is intentionally NOT a
// product smoke test -- the integration smoke suite lives in
// integration-smoke.test.js (env-gated against the dev backend).
describe('framework sanity (vitest + ESM)', () => {
  it('should run a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string assertions', () => {
    expect('hello world').toContain('world');
  });

  it('should work with ESM imports', () => {
    expect(typeof describe).toBe('function');
    expect(typeof it).toBe('function');
    expect(typeof expect).toBe('function');
  });
});
