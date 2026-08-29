import { describe, expect, it } from 'vitest';
import { buildInstructions, buildScanSpec } from '../../src/agent/spec.js';

describe('buildScanSpec', () => {
  const spec = buildScanSpec('http://localhost:3000/', {
    model: 'openai/gpt-5',
    sandbox: true,
    mcpServers: ['truestrike-gateway'],
  });

  it('uses the requested model', () => {
    expect(spec.model.name).toBe('openai/gpt-5');
  });

  it('locks the authorized target into the instructions', () => {
    expect(spec.instructions).toContain('http://localhost:3000/');
    expect(spec.instructions).toMatch(/Authorized scope/i);
  });

  it('forbids acting on out-of-scope hosts', () => {
    expect(spec.instructions).toMatch(/ONLY system you may interact with/i);
    expect(spec.instructions).toMatch(/Do not expand scope on your own initiative/i);
  });

  it('defines the recon, validate, report phases', () => {
    expect(spec.instructions).toMatch(/1\. RECON\./);
    expect(spec.instructions).toMatch(/2\. VALIDATE\./);
    expect(spec.instructions).toMatch(/3\. REPORT\./);
  });

  it('requires a working PoC before a finding counts', () => {
    expect(spec.instructions).toMatch(/proof-of-concept/i);
    expect(spec.instructions).toMatch(/not a finding/i);
  });

  it('defines the report artifact contract', () => {
    expect(spec.instructions).toContain('/workspace/truestrike-report/pentest_report.md');
    expect(spec.instructions).toContain('/workspace/truestrike-report/findings.json');
    expect(spec.instructions).toMatch(/"severity": "critical\|high\|medium\|low\|info"/);
    expect(spec.instructions).toMatch(/"status": "confirmed\|probable"/);
    expect(spec.instructions).toMatch(/cvssVector/);
  });

  it('requires both report files even with no findings', () => {
    expect(spec.instructions).toMatch(/empty findings array/);
  });

  it('requires approval before intrusive actions', () => {
    expect(spec.instructions).toMatch(/explicit human approval/i);
    expect(spec.instructions).toMatch(/denied/i);
  });

  it('enables subagents, sandbox, and a sane iteration limit', () => {
    expect(spec.config?.dynamicSubAgents?.enabled).toBe(true);
    expect(spec.config?.sandbox?.enabled).toBe(true);
    expect(spec.config?.iterationLimit).toBeGreaterThan(10);
  });

  it('attaches MCP servers with approval gates on write and destructive tools', () => {
    expect(spec.mcpServers).toEqual([
      { name: 'truestrike-gateway', requireApprovalForTools: ['@write', '@destructive'] },
    ]);
  });

  it('omits the mcpServers field when none are configured', () => {
    const bare = buildScanSpec('http://localhost:3000/', {
      model: 'openai/gpt-5',
      sandbox: false,
      mcpServers: [],
    });
    expect(bare.mcpServers).toBeUndefined();
    expect(bare.config?.sandbox?.enabled).toBe(false);
  });
});

describe('buildInstructions', () => {
  const instructions = buildInstructions('http://localhost:3000/');

  it('contains no em-dashes or ellipsis characters', () => {
    expect(instructions).not.toMatch(/—|…/);
  });

  it('instructs the orchestrator to delegate to subagents', () => {
    expect(instructions).toMatch(/subagents?/i);
  });
});
