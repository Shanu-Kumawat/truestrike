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

/**
 * Ensures a ready snapshot exists: creates it, or adopts an existing one on
 * 409. If an adopted snapshot vanishes mid-poll (it was a deleting leftover),
 * the create attempt is retried. Returns 'ready' or throws on failure.
 */
async function ensureSnapshot() {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`Retry ${attempt}/${MAX_ATTEMPTS}: creating snapshot again...`);
    }
    try {
      // Do not pass our deadline as an SDK request timeout: the SDK surfaces
      // it as a client-side abort while the build may still run server-side.
      // Race instead, then observe state via our own bounded poll below.
      await Promise.race([
        daytona.snapshot.create(
          { name, image, entrypoint: ['/usr/bin/supervisord', '-n'] },
          { onLogs: (log) => process.stdout.write(log) },
        ),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('create() wait abandoned; build may still be running')),
            Math.max(remainingMs(), 0),
          ),
        ),
      ]);
    } catch (error) {
      if (error?.statusCode === 409) {
        console.log(`Snapshot "${name}" already exists; adopting it.`);
      } else if (remainingMs() <= 0) {
        failOnTimeout('waiting for snapshot.create()');
      } else {
        // Timeout-class failures may still leave the build running; the poll
        // below decides. Anything else is fatal for this attempt.
        console.log(
          `create() ended with: ${error?.message ?? error}; continuing via state polling...`,
        );
      }
    }

    for (;;) {
      if (remainingMs() <= 0) {
        failOnTimeout('waiting for snapshot readiness');
      }
      const snapshot = await getSnapshot(name);
      if (!snapshot) {
        // The adopted snapshot disappeared (e.g. a deletion that was still
        // landing when our create hit 409). Break out and create fresh.
        console.log('Adopted snapshot vanished mid-poll; retrying create.');
        break;
      }
      const state = String(snapshot.state ?? '').toLowerCase();
      console.log(`[${new Date().toISOString()}] state=${state}`);
      if (READY_STATES.has(state)) {
        return;
      }
      if (FAILED_STATES.has(state)) {
        throw new Error(`Snapshot build failed: ${snapshot.errorReason ?? 'unknown error'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
  throw new Error(`Could not establish a ready snapshot after ${MAX_ATTEMPTS} attempts`);
}

/**
 * Definitive verification: boots a throwaway sandbox from the snapshot and
 * runs the toolchain smoke. Adoption by name cannot prove content; this can.
 */
async function verifyToolchain() {
  console.log('Verifying toolchain in a throwaway sandbox from the snapshot...');
  const sandbox = await daytona.create({ snapshot: name });
  try {
    const result = await sandbox.process.executeCommand(
      'nuclei -version && httpx -version && ffuf -V && nmap --version | head -n 1',
      undefined,
      undefined,
      120,
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Toolchain verification failed (exit ${result.exitCode}): ${JSON.stringify(result)}`,
      );
    }
    console.log('Toolchain verification output:');
    console.log(String(result.result ?? '').trim());
  } finally {
    await sandbox.delete(60, true).catch(() => {});
  }
}

await ensureSnapshot();
console.log(`Snapshot "${name}" is ready.`);
await verifyToolchain();
console.log(`Snapshot "${name}" is ready and verified.`);
process.exit(0);
