/**
 * CVSS 3.1 base-score computation from a vector string.
 * Implements the specification at https://www.first.org/cvss/v3.1/specification-document.
 */

export class CvssError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvssError';
  }
}

interface ParsedVector {
  scopeChanged: boolean;
  attackVector: number;
  attackComplexity: number;
  privilegesRequired: number;
  userInteraction: number;
  confidentiality: number;
  integrity: number;
  availability: number;
}

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC: Record<string, number> = { L: 0.77, H: 0.44 };
const UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

/** PR weight depends on the Scope metric (CVSS 3.1 spec section 8.2). */
function privilegesWeight(pr: string, scopeChanged: boolean): number {
  if (pr === 'N') {
    return 0.85;
  }
  if (pr === 'L') {
    return scopeChanged ? 0.68 : 0.62;
  }
  if (pr === 'H') {
    return scopeChanged ? 0.5 : 0.27;
  }
  return Number.NaN;
}

const REQUIRED_METRICS = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const;

function lookup(
  table: Record<string, number>,
  value: string,
  metric: string,
  vector: string,
): number {
  const weight = table[value];
  if (weight === undefined) {
    throw new CvssError(`Invalid value for ${metric} ("${value}") in "${vector}"`);
  }
  return weight;
}

/**
 * Parses a CVSS:3.1 vector. Throws CvssError for anything malformed.
 */
export function parseCvssVector(vector: string): ParsedVector {
  const parts = vector
    .trim()
    .split('/')
    .map((part) => part.trim());
  const prefix = parts.shift();
  if (prefix !== 'CVSS:3.1') {
    throw new CvssError(`Not a CVSS 3.1 vector (expected prefix "CVSS:3.1"): "${vector}"`);
  }

  const metrics = new Map<string, string>();
  for (const part of parts) {
    const [key, value] = part.split(':');
    if (key === undefined || value === undefined || metrics.has(key)) {
      throw new CvssError(`Malformed or duplicate metric "${part}" in "${vector}"`);
    }
    metrics.set(key, value);
  }

  for (const key of REQUIRED_METRICS) {
    if (!metrics.has(key)) {
      throw new CvssError(`Missing required metric ${key} in "${vector}"`);
    }
  }

  const scope = metrics.get('S');
  if (scope !== 'U' && scope !== 'C') {
    throw new CvssError(`Invalid Scope value "${scope}" in "${vector}"`);
  }
  const scopeChanged = scope === 'C';

  const privilegesRequired = privilegesWeight(metrics.get('PR') ?? '', scopeChanged);
  if (Number.isNaN(privilegesRequired)) {
    throw new CvssError(`Invalid value for PR in "${vector}"`);
  }

  return {
    scopeChanged,
    attackVector: lookup(AV, metrics.get('AV') ?? '', 'AV', vector),
    attackComplexity: lookup(AC, metrics.get('AC') ?? '', 'AC', vector),
    privilegesRequired,
    userInteraction: lookup(UI, metrics.get('UI') ?? '', 'UI', vector),
    confidentiality: lookup(CIA, metrics.get('C') ?? '', 'C', vector),
    integrity: lookup(CIA, metrics.get('I') ?? '', 'I', vector),
    availability: lookup(CIA, metrics.get('A') ?? '', 'A', vector),
  };
}

/** CVSS 3.1 rounding: "Roundup" to one decimal, never rounding up to 10.0 from below. */
function roundUp(input: number): number {
  const roundedUp = Math.ceil(input * 10) / 10;
  if (input < 10 && roundedUp > 10) {
    return 10;
  }
  if (input <= 10 && roundedUp > 10) {
    return 10;
  }
  return roundedUp;
}

/**
 * Computes the CVSS 3.1 base score for a vector string.
 * Throws CvssError for invalid vectors.
 */
export function cvssBaseScore(vector: string): number {
  const v = parseCvssVector(vector);

  const impactSubScore = 1 - (1 - v.confidentiality) * (1 - v.integrity) * (1 - v.availability);
  const impact = v.scopeChanged
    ? 7.52 * (impactSubScore - 0.029) - 3.25 * Math.pow(impactSubScore - 0.02, 15)
    : 6.42 * impactSubScore;
  const exploitability =
    8.22 * v.attackVector * v.attackComplexity * v.privilegesRequired * v.userInteraction;

  if (impact <= 0) {
    return 0;
  }
  if (v.scopeChanged) {
    return roundUp(Math.min(1.08 * (impact + exploitability), 10));
  }
  return roundUp(Math.min(impact + exploitability, 10));
}
