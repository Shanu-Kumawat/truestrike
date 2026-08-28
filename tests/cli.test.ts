import { describe, expect, it } from 'vitest';
import { USAGE, parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses a scan command with its target', () => {
    expect(parseArgs(['scan', 'http://localhost:3000'])).toEqual({
      targetUrl: 'http://localhost:3000',
    });
  });

  it('returns usage for missing or wrong commands', () => {
    expect(parseArgs([])).toEqual({ usage: true });
    expect(parseArgs(['scan'])).toEqual({ usage: true });
    expect(parseArgs(['recon', 'http://localhost:3000'])).toEqual({ usage: true });
  });
});

describe('USAGE', () => {
  it('documents the scan command and required model env', () => {
    expect(USAGE).toContain('truestrike scan <target-url>');
    expect(USAGE).toContain('TRUESTRIKE_MODEL');
    expect(USAGE).not.toMatch(/—|…/);
  });
});
