import { describe, expect, it } from 'vitest';
import { TargetScopeError, validateTarget } from '../src/target.js';

describe('validateTarget', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://localhost',
    'http://[::1]:3000',
  ])('allows loopback target %s', (target) => {
    expect(validateTarget(target)).toBe(new URL(target).toString());
  });

  it('rejects external hosts by default', () => {
    expect(() => validateTarget('https://example.com')).toThrow(TargetScopeError);
    expect(() => validateTarget('http://169.254.169.254/')).toThrow(TargetScopeError);
  });

  it('allows hosts explicitly added to the allowlist', () => {
    expect(validateTarget('http://juice-shop.internal:3000', ['juice-shop.internal'])).toBe(
      'http://juice-shop.internal:3000/',
    );
  });

  it('is case-insensitive for allowlisted hosts', () => {
    expect(validateTarget('http://Juice-Shop.INTERNAL:3000', ['juice-shop.internal'])).toBe(
      'http://juice-shop.internal:3000/',
    );
  });

  it('rejects non-http protocols', () => {
    expect(() => validateTarget('ftp://localhost:3000')).toThrow(TargetScopeError);
    expect(() => validateTarget('file:///etc/passwd')).toThrow(TargetScopeError);
  });

  it('rejects malformed URLs', () => {
    expect(() => validateTarget('not-a-url')).toThrow(TargetScopeError);
    expect(() => validateTarget('')).toThrow(TargetScopeError);
  });

  it('mentions the allowlist in the error message', () => {
    expect(() => validateTarget('https://example.com')).toThrow(/TRUESTRIKE_ALLOW_HOSTS/);
  });
});
