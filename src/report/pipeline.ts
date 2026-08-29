import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { sanitizeForTerminal } from '../terminal.js';
import { loadAuditEntries, renderAuditAppendix } from './audit.js';
import { validateFindings } from './findings.js';

export const REPORT_MD_PATH = '/workspace/truestrike-report/pentest_report.md';
export const FINDINGS_JSON_PATH = '/workspace/truestrike-report/findings.json';

export interface ReportOutcome {
  /** Directory the artifacts were written to; undefined when download failed. */
  outputDir: string | undefined;
  findingsCount: number;
  /** Exit code contribution: 2 when findings exist, 0 otherwise. */
  exitCode: number;
}

interface DownloadFn {
  (
    sessionId: string,
    turnId: string,
    request: TrueForgeApi.DownloadSandboxFileSessionsRequest,
  ): Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>;
  }>;
}

function toDownloadFn(client: TrueForge): DownloadFn {
  return (sessionId, turnId, request) =>
    client.sessions.downloadSandboxFile(sessionId, turnId, request) as unknown as Promise<{
      arrayBuffer: () => Promise<ArrayBuffer>;
    }>;
}

async function downloadText(
  download: DownloadFn,
  sessionId: string,
  turnId: string,
  path: string,
): Promise<string | undefined> {
  try {
    const response = await download(sessionId, turnId, { path });
    return Buffer.from(await response.arrayBuffer()).toString('utf8');
  } catch (error) {
    console.error(
      `[report] could not download ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Downloads the engagement artifacts from the sandbox (the agent must have
 * emitted a sandbox_artifacts block listing them), validates findings.json,
 * renders the final report with the approved-actions appendix, and writes
 * everything to ./truestrike-runs/<sessionId>/.
 *
 * Failures degrade to warnings: a completed scan always yields an exit code,
 * never a crash. Returns the exit code contribution (2 = findings found).
 */
export async function collectReport(
  client: TrueForge,
  sessionId: string,
  finalTurnId: string | undefined,
  outputRoot: string,
  auditLogPath: string,
): Promise<ReportOutcome> {
  if (finalTurnId === undefined) {
    console.error('[report] no turn to collect artifacts from; skipping report');
    return { outputDir: undefined, findingsCount: 0, exitCode: 0 };
  }
  const download = toDownloadFn(client);

  const [reportMd, findingsRaw] = await Promise.all([
    downloadText(download, sessionId, finalTurnId, REPORT_MD_PATH),
    downloadText(download, sessionId, finalTurnId, FINDINGS_JSON_PATH),
  ]);

  if (reportMd === undefined && findingsRaw === undefined) {
    console.error(
      '[report] neither report artifact could be downloaded; did the agent emit a sandbox_artifacts block?',
    );
    return { outputDir: undefined, findingsCount: 0, exitCode: 0 };
  }

  const validated = findingsRaw
    ? validateFindings(findingsRaw)
    : {
        findings: [],
        validationError: 'findings.json was not downloadable',
        scoreDiscrepancies: [],
      };
  if (validated.validationError !== undefined) {
    console.error(`[report] findings validation: ${validated.validationError}`);
  }

  const outputDir = join(outputRoot, sessionId);
  await mkdir(outputDir, { recursive: true });

  const sections: string[] = [];
  sections.push(
    reportMd !== undefined
      ? sanitizeForTerminal(reportMd)
      : '# Penetration test report\n\nThe agent-written report could not be downloaded; see the scan transcript.',
  );

  if (validated.scoreDiscrepancies.length > 0) {
    const lines = [
      '## CVSS score verification',
      '',
      'Reported scores that disagreed with the vector-derived score; the computed',
      'score is authoritative in findings.json:',
      '',
      '| Finding | Reported | Computed |',
      '| --- | --- | --- |',
    ];
    for (const d of validated.scoreDiscrepancies) {
      lines.push(`| ${d.id} | ${d.reported} | ${d.computed} |`);
    }
    sections.push(lines.join('\n'));
  }

  const auditEntries = await loadAuditEntries(auditLogPath);
  if (auditEntries !== undefined) {
    const appendix = renderAuditAppendix(auditEntries);
    if (appendix !== undefined) {
      sections.push(appendix);
    }
  }

  const finalReport = `${sections.join('\n\n---\n\n')}\n`;
  await writeFile(join(outputDir, 'pentest_report.md'), finalReport, 'utf8');
  await writeFile(
    join(outputDir, 'findings.json'),
    JSON.stringify({ findings: validated.findings }, null, 2),
    'utf8',
  );

  console.log(`\nReport written to ${join(outputDir, 'pentest_report.md')}`);
  console.log(
    `Findings: ${validated.findings.length}${validated.findings.length > 0 ? ' (exit code 2)' : ''}`,
  );

  return {
    outputDir,
    findingsCount: validated.findings.length,
    exitCode: validated.findings.length > 0 ? 2 : 0,
  };
}
