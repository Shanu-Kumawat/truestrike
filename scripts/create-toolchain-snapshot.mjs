#!/usr/bin/env node
// Creates the TrueStrike toolchain snapshot in Daytona from
// sandbox/overlay.Dockerfile so TrueForge's Daytona provider adopts it by
// name (trueforge-build-<digest>) without a registry push (TS-11).
//
// Usage (run from a directory where @daytona/sdk resolves, e.g. a trueforge
// checkout's packages/trueforge-core):
//   DAYTONA_API_KEY=... node create-toolchain-snapshot.mjs \
//     <truestrike-repo>/sandbox/overlay.Dockerfile trueforge-build-<digest>
//
// Env:
//   FORCE_REBUILD=1  delete an existing snapshot with this name and rebuild
//                    (use after changing the Dockerfile)
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
// The official TrueForge provider builds its snapshot from this registry;
// an existing snapshot referencing it is NOT our toolchain build.
const OFFICIAL_IMAGE_MARKER = 'tfy.jfrog.io';

const deadline = Date.now() + TIMEOUT_MS;
const remainingMs = () => deadline - Date.now();
const failOnTimeout = (where) => {
  console.error(`Timed out (${where}) after ${TIMEOUT_MS / 60000} minutes`);
  process.exit(1);
};

const daytona = new Daytona({ apiKey });
const image = Image.fromDockerfile(dockerfile);

/** get() that returns undefined on 404 instead of throwing. */
async function getSnapshot(snapshotName) {
  try {
    return await daytona.snapshot.get(snapshotName);
  } catch (error) {
    if (error?.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

/** Deletes a snapshot and waits until the name is actually free. */
async function deleteSnapshot(snapshot) {
  console.log(`Deleting snapshot "${name}" (state: ${snapshot.state})...`);
  await daytona.snapshot.delete(snapshot);
  for (;;) {
    if (remainingMs() <= 0) {
      failOnTimeout('waiting for snapshot deletion');
    }
    const lingering = await getSnapshot(name);
    if (!lingering) {
      console.log('Snapshot removed; name is free.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

const existing = await getSnapshot(name);
if (existing) {
  const state = String(existing.state ?? '').toLowerCase();
  if (process.env.FORCE_REBUILD === '1') {
    console.log('FORCE_REBUILD=1: replacing existing snapshot regardless of state.');
    await deleteSnapshot(existing);
  } else if (FAILED_STATES.has(state)) {
    console.log('Existing snapshot is in a failed state; replacing it.');
    await deleteSnapshot(existing);
  } else if (String(existing.imageName ?? '').includes(OFFICIAL_IMAGE_MARKER)) {
    // The provider built the official image under this name (e.g. it was
    // configured before this script ran). Adopting it would silently run
    // scans without the toolchain, so replace it with our build.
    console.log(
      `Existing snapshot uses the official image (${existing.imageName}); ` +
        'replacing it with the toolchain build.',
    );
    await deleteSnapshot(existing);
  }
}

console.log(`Creating snapshot "${name}" from ${dockerfile} (Daytona builds server-side)...`);
try {
  await daytona.snapshot.create(
    { name, image, entrypoint: ['/usr/bin/supervisord', '-n'] },
    { timeout: remainingMs(), onLogs: (log) => process.stdout.write(log) },
  );
} catch (error) {
  if (error?.statusCode === 409) {
    console.log(`Snapshot "${name}" already exists; adopting it.`);
    console.log(
      'NOTE: adoption cannot verify the existing snapshot was built from this ' +
        'Dockerfile. If the toolchain is missing in scans, rerun with FORCE_REBUILD=1.',
    );
  } else {
    throw error;
  }
}

for (;;) {
  if (remainingMs() <= 0) {
    failOnTimeout('waiting for snapshot readiness');
  }
  const snapshot = await getSnapshot(name);
  const state = snapshot ? String(snapshot.state ?? '').toLowerCase() : 'pending';
  console.log(`[${new Date().toISOString()}] state=${state}`);
  if (snapshot && READY_STATES.has(state)) {
    console.log(`Snapshot "${name}" is ready.`);
    process.exit(0);
  }
  if (snapshot && FAILED_STATES.has(state)) {
    console.error(`Snapshot build failed: ${snapshot.errorReason ?? 'unknown error'}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
