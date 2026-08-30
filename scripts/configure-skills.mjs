#!/usr/bin/env node
// Configures TrueForge git-backed skills from this repository (see
// skills/skills.json for the catalog). Re-runnable: every pack is upserted.
//
// Usage:
//   node scripts/configure-skills.mjs [--ref main] [--base-url http://localhost:8790]
//
// Reads TRUEFORGE_BASE_URL from the environment when --base-url is absent.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] !== undefined) {
    return process.argv[index + 1];
  }
  return fallback;
}

const baseUrl = arg('base-url', process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790').replace(
  /\/+$/,
  '',
);
const ref = arg('ref', 'main');
const repoUrl = 'https://github.com/Shanu-Kumawat/truestrike';

// Hosted TrueForge servers require the OIDC ID token; local mode ignores it.
const headers = { 'content-type': 'application/json' };
if (process.env.TRUEFORGE_TOKEN) {
  headers.Authorization = `Bearer ${process.env.TRUEFORGE_TOKEN}`;
}

const catalog = JSON.parse(await readFile(join(repoRoot, 'skills', 'skills.json'), 'utf8'));

let failures = 0;
for (const skill of catalog.skills) {
  const response = await fetch(`${baseUrl}/api/v1/settings/skills`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      manifest: {
        type: 'git',
        name: skill.name,
        url: repoUrl,
        path: `skills/${skill.name}`,
        ref,
        description: skill.description,
      },
    }),
  });
  if (response.ok) {
    console.log(`configured ${skill.name}`);
  } else {
    failures += 1;
    console.error(`FAILED ${skill.name}: ${response.status} ${await response.text()}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
console.log(`\nAll ${catalog.skills.length} skills configured (ref=${ref}, server=${baseUrl}).`);
