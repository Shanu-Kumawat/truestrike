import { z } from 'zod';
import { CvssError, cvssBaseScore } from './cvss.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const STATUSES = ['confirmed', 'probable'] as const;

export const FindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(SEVERITIES),
  cvssVector: z.string().min(1),
  cvssScore: z.number().min(0).max(10),
  endpoint: z.string().min(1),
  poc: z.string().min(1),
  evidence: z.string().min(1),
  remediation: z.string().min(1),
  status: z.enum(STATUSES),
});

export const FindingsFileSchema = z.object({
  findings: z.array(FindingSchema),
});

export type Finding = z.infer<typeof FindingSchema>;

export interface ValidatedFindings {
  findings: Finding[];
  /** Present when the file existed but failed schema validation. */
  validationError: string | undefined;
  /** Findings whose CVSS score disagrees with the vector-derived score. */
  scoreDiscrepancies: Array<{ id: string; reported: number; computed: number }>;
}

/**
 * Validates a findings.json payload. Never throws: malformed input becomes
 * validationError, and CVSS scores are recomputed from the vectors with any
 * disagreements recorded (the computed score is authoritative).
 */
export function validateFindings(raw: string): ValidatedFindings {
  const empty: ValidatedFindings = {
    findings: [],
    validationError: undefined,
    scoreDiscrepancies: [],
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ...empty, validationError: `invalid JSON: ${String(error)}` };
  }

  const result = FindingsFileSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ...empty,
      validationError: first
        ? `${first.path.join('.')}: ${first.message}`
        : 'schema validation failed',
    };
  }

  const scoreDiscrepancies: ValidatedFindings['scoreDiscrepancies'] = [];
  const findings: Finding[] = [];
  for (const finding of result.data.findings) {
    try {
      const computed = cvssBaseScore(finding.cvssVector);
      if (Math.abs(computed - finding.cvssScore) > 0.001) {
        scoreDiscrepancies.push({
          id: finding.id,
          reported: finding.cvssScore,
          computed,
        });
      }
      findings.push({ ...finding, cvssScore: computed });
    } catch (error) {
      if (error instanceof CvssError) {
        return {
          ...empty,
          validationError: `finding ${finding.id}: ${error.message}`,
        };
      }
      throw error;
    }
  }

  return { findings, validationError: undefined, scoreDiscrepancies };
}
