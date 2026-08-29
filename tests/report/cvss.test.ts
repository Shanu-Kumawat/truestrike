import { describe, expect, it } from 'vitest';
import { CvssError, cvssBaseScore, parseCvssVector } from '../../src/report/cvss.js';

describe('cvssBaseScore', () => {
  it.each([
    // [vector, expected] - reference scores from the CVSS 3.1 calculator.
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 7.5],
    ['CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:L', 3.9],
    ['CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:L', 1.6],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0],
    // PR weights differ with changed scope.
    ['CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H', 9.9],
  ])('scores %s as %s', (vector, expected) => {
    expect(cvssBaseScore(vector)).toBe(expected);
  });

  it('rejects invalid vectors', () => {
    expect(() => cvssBaseScore('not-a-vector')).toThrow(CvssError);
    expect(() => cvssBaseScore('CVSS:2.0/AV:N/AC:L')).toThrow(CvssError);
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:X/C:H/I:H/A:H')).toThrow(CvssError);
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H')).toThrow(CvssError);
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/AV:N')).toThrow(
      CvssError,
    );
  });

  it('rejects unknown metric keys instead of ignoring them', () => {
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/ZZ:X')).toThrow(
      /Unknown metric/,
    );
  });

  it('rejects metrics with extra segments', () => {
    expect(() => cvssBaseScore('CVSS:3.1/AV:N:garbage/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toThrow(
      /Malformed/,
    );
  });

  it('accepts known non-base metrics it does not score', () => {
    // Temporal metrics are legal CVSS 3.1; the base score ignores them.
    expect(() =>
      cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:H/RL:U/RC:C'),
    ).not.toThrow();
  });

  it('accepts modified user interaction as MUI (CVSS 3.1 spelling)', () => {
    expect(() =>
      cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MUI:R/MS:C'),
    ).not.toThrow();
  });

  it('rejects invalid values for known temporal and environmental metrics', () => {
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:INVALID')).toThrow(
      /Invalid value "INVALID" for metric E/,
    );
    expect(() => cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MAV:INVALID')).toThrow(
      /Invalid value "INVALID" for metric MAV/,
    );
  });
});

describe('parseCvssVector', () => {
  it('exposes the scope-changed flag', () => {
    expect(parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H').scopeChanged).toBe(true);
    expect(parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').scopeChanged).toBe(
      false,
    );
  });
});
