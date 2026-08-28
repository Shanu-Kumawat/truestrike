import { describe, expect, it } from 'vitest';
import { USAGE, loadGatewayOptions, parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses a scan command with its target', () => {
    expect(parseArgs(['scan', 'http://localhost:3000'])).toEqual({
      command: 'scan',
      targetUrl: 'http://localhost:3000',
      resume: false,
    });
  });

  it('parses the resume flag without a target', () => {
    expect(parseArgs(['scan', '--resume'])).toEqual({ command: 'scan', resume: true });
  });

  it('rejects --resume combined with a target', () => {
    expect(parseArgs(['scan', '--resume', 'http://localhost:3000'])).toEqual({ usage: true });
  });

  it('parses the gateway command without extra arguments', () => {
    expect(parseArgs(['gateway'])).toEqual({ command: 'gateway' });
  });

  it('returns usage for missing or wrong commands', () => {
    expect(parseArgs([])).toEqual({ usage: true });
    expect(parseArgs(['scan'])).toEqual({ usage: true });
    expect(parseArgs(['recon', 'http://localhost:3000'])).toEqual({ usage: true });
    expect(parseArgs(['gateway', 'extra'])).toEqual({ usage: true });
  });
});

describe('loadGatewayOptions', () => {
  it('applies defaults', () => {
    expect(loadGatewayOptions({})).toEqual({ port: 8815, auditLogPath: '.truestrike/audit.jsonl' });
  });

  it('reads overrides from the environment', () => {
    expect(
      loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: '9100', TRUESTRIKE_AUDIT_LOG: '/tmp/a.jsonl' }),
    ).toEqual({ port: 9100, auditLogPath: '/tmp/a.jsonl' });
  });

  it('rejects invalid ports', () => {
    expect(() => loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: 'notaport' })).toThrow(
      /TRUESTRIKE_GATEWAY_PORT/,
    );
    expect(() => loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: '99999' })).toThrow(
      /TRUESTRIKE_GATEWAY_PORT/,
    );
  });
});

describe('USAGE', () => {
  it('documents the scan command and required model env', () => {
    expect(USAGE).toContain('truestrike scan <target-url>');
    expect(USAGE).toContain('TRUESTRIKE_MODEL');
    expect(USAGE).not.toMatch(/—|…/);
  });
});
