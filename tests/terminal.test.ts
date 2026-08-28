import { describe, expect, it } from 'vitest';
import { sanitizeForTerminal } from '../src/terminal.js';

describe('sanitizeForTerminal', () => {
  it('strips ANSI CSI sequences', () => {
    const input = 'safe\x1b[2J\x1b[31mred\x1b[0m end';
    expect(sanitizeForTerminal(input)).toBe('safered end');
  });

  it('disarms non-CSI escape sequences: ESC is stripped so the remainder is inert', () => {
    expect(sanitizeForTerminal('a\x1b]0;title\x07b')).toBe('a0;title b');
    expect(sanitizeForTerminal('a\x1bXb')).toBe('ab');
  });

  it('keeps newlines and tabs', () => {
    expect(sanitizeForTerminal('line\nnext\tcol')).toBe('line\nnext\tcol');
  });

  it('replaces other C0, DEL, and C1 control characters with a space', () => {
    expect(sanitizeForTerminal('a\x00\x07\x1f\x7fb')).toBe('a    b');
    expect(sanitizeForTerminal('a\x9bb')).toBe('a b');
  });

  it('handles escape sequences split across a text boundary imperfectly but safely', () => {
    // A CSI split across chunks degrades to a stripped ESC and leftover
    // parameter characters; no escape execution is possible.
    expect(sanitizeForTerminal('\x1b[')).toBe(' [');
  });

  it('leaves ordinary text untouched', () => {
    expect(sanitizeForTerminal('http://localhost:3000/admin?id=1')).toBe(
      'http://localhost:3000/admin?id=1',
    );
  });
});
