#!/usr/bin/env node
// Creates the TrueStrike toolchain snapshot in Daytona from
// sandbox/overlay.Dockerfile so TrueForge's Daytona provider adopts it by
// name (trueforge-build-<digest>) without a registry push (TS-11).
//
// Usage (run from the trueforge clone so @daytona/sdk resolves):
//   cd ~/dev/open-source/trueforge
//   DAYTONA_API_KEY=... node <repo>/scripts/create-toolchain-snapshot.mjs \
//     <truestrike-repo>/sandbox/overlay.Dockerfile trueforge-build-<digest>
//
// Polls until the snapshot is active, or fails on error/build_failed.

import { Daytona, Image } from '@daytona/sdk';

const [dockerfile, name] = process.argv.slice(2);
const apiKey = process.env.DAYTONA_API_KEY;

if (!dockerfile || !name || !apiKey) {
  console.error(
    'usage: DAYTONA_API_KEY=... node create-toolchain-snapshot.mjs <dockerfile-path> <snapshot-name>',
  );
  process.exit(2);
}

const READY_STATES = new Set(['active', 'ready']);
const FAILED_STATES = new Set(['error', 'build_failed']);
const TIMEOUT_MS = 45 * 60 * 1000;

const daytona = new Daytona({ apiKey });
const image = Image.fromDockerfile(dockerfile);

/** get() that returns undefined on 404 instead of throwing. */
async function getSnapshot(name) {
  try {
    return await daytona.snapshot.get(name);
  } catch (error) {
    if (error?.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

// A previously failed build with the same name must be removed before
// recreating; otherwise the failed snapshot is adopted and polls forever.
// Deletion is async server-side: wait until the name is actually free.
const existing = await getSnapshot(name);
if (existing && FAILED_STATES.has(String(existing.state ?? '').toLowerCase())) {
  console.log(`Removing failed snapshot "${name}" (state: ${existing.state})...`);
  await daytona.snapshot.delete(existing);
  for (;;) {
    const lingering = await getSnapshot(name);
    if (!lingering) {
      console.log('Failed snapshot removed; name is free.');
      break;
    }
    if (FAILED_STATES.has(String(lingering.state ?? '').toLowerCase())) {
      // Still the failed record; keep waiting for the delete to land.
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    break;
  }
}

console.log(`Creating snapshot "${name}" from ${dockerfile} (Daytona builds server-side)...`);
try {
  await daytona.snapshot.create(
    { name, image, entrypoint: ['/usr/bin/supervisord', '-n'] },
    { onLogs: (log) => process.stdout.write(log) },
  );
} catch (error) {
  if (error?.statusCode === 409) {
    console.log(`Snapshot "${name}" already exists; adopting it.`);
  } else {
    throw error;
  }
}

const startedAt = Date.now();
for (;;) {
  const snapshot = await getSnapshot(name);
  const state = snapshot ? String(snapshot.state ?? '').toLowerCase() : 'pending-removal-or-create';
  console.log(`[${new Date().toISOString()}] state=${state}`);
  if (snapshot && READY_STATES.has(state)) {
    console.log(`Snapshot "${name}" is ready.`);
    process.exit(0);
  }
  if (snapshot && FAILED_STATES.has(state)) {
    console.error(`Snapshot build failed: ${snapshot.errorReason ?? 'unknown error'}`);
    process.exit(1);
  }
  if (Date.now() - startedAt > TIMEOUT_MS) {
    console.error(`Timed out waiting for snapshot (last state: ${state})`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
