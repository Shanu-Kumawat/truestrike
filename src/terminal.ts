// eslint-disable-next-line no-control-regex -- stripping ESC sequences is the purpose
const ANSI_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;

/**
 * Strips terminal control sequences from untrusted text before it is written
 * to the operator's terminal. Tool results and tool-call arguments can contain
 * attacker-influenced content; raw output would let a target inject ANSI
 * escape sequences into the operator's terminal.
 *
 * Removes ANSI escape sequences (CSI and two-character ESC forms), then
 * replaces C0 control characters other than newline and tab, DEL, and C1
 * controls with a space.
 */
export function sanitizeForTerminal(text: string): string {
  let out = '';
  for (const ch of text.replace(ANSI_ESCAPE, '')) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || ch === '\t') {
      out += ch;
      continue;
    }
    out += code < 32 || (code >= 127 && code <= 159) ? ' ' : ch;
  }
  return out;
}
