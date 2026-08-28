import { describe, expect, it } from 'vitest';
import { buildScanSpec } from '../../src/agent/spec.js';

describe('buildScanSpec', () => {
  const spec = buildScanSpec('http://localhost:3000/', 'openai/gpt-5');

  it('uses the requested model', () => {
    expect(spec.model.name).toBe('openai/gpt-5');
  });

  it('locks the authorized target into the instructions', () => {
    expect(spec.instructions).toContain('http://localhost:3000/');
    expect(spec.instructions).toMatch(/scope/i);
  });

  it('forbids acting on out-of-scope hosts', () => {
    expect(spec.instructions).toMatch(/only ever act against this exact target/i);
  });

  it('caps the iteration limit', () => {
    expect(spec.config?.iterationLimit).toBeGreaterThan(0);
  });
});
