import { describe, it, expect } from 'vitest';

describe('Vitest smoke test', () => {
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
