import { describe, expect, it } from 'vitest';
import { validateFindings } from '../../src/report/findings.js';

const validFinding = {
  id: 'F-001',
  title: 'SQL injection in product search',
  severity: 'critical',
  cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  cvssScore: 9.8,
  endpoint: 'http://localhost:3000/rest/products',
  poc: 'send payload in q parameter',
  evidence: 'database error leaked in response',
  remediation: 'parameterized queries',
  status: 'confirmed',
};

describe('validateFindings', () => {
  it('accepts a valid findings file', () => {
    const result = validateFindings(JSON.stringify({ findings: [validFinding] }));
    expect(result.validationError).toBeUndefined();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.id).toBe('F-001');
    expect(result.scoreDiscrepancies).toEqual([]);
  });

  it('accepts an empty findings array', () => {
    const result = validateFindings(JSON.stringify({ findings: [] }));
    expect(result.validationError).toBeUndefined();
    expect(result.findings).toHaveLength(0);
  });

  it('reports invalid JSON as a validation error', () => {
    const result = validateFindings('{not json');
    expect(result.validationError).toMatch(/invalid JSON/);
    expect(result.findings).toHaveLength(0);
  });

  it('reports schema violations without throwing', () => {
    const result = validateFindings(
      JSON.stringify({ findings: [{ ...validFinding, severity: 'super-duper' }] }),
    );
    expect(result.validationError).toBeTruthy();
    expect(result.findings).toHaveLength(0);
  });

  it('rejects findings with invalid CVSS vectors', () => {
    const result = validateFindings(
      JSON.stringify({ findings: [{ ...validFinding, cvssVector: 'nope' }] }),
    );
    expect(result.validationError).toMatch(/F-001/);
  });

  it('records and corrects score discrepancies', () => {
    const result = validateFindings(
      JSON.stringify({
        findings: [{ ...validFinding, cvssScore: 5.0 }],
      }),
    );
    expect(result.validationError).toBeUndefined();
    expect(result.scoreDiscrepancies).toEqual([{ id: 'F-001', reported: 5.0, computed: 9.8 }]);
    // The computed score wins.
    expect(result.findings[0]?.cvssScore).toBe(9.8);
  });
});
