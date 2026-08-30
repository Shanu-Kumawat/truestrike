import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CatalogEntry {
  name: string;
  description: string;
}

const skillsRoot = join(import.meta.dirname, '..', 'skills');

async function loadCatalog(): Promise<CatalogEntry[]> {
  const raw = await readFile(join(skillsRoot, 'skills.json'), 'utf8');
  return (JSON.parse(raw) as { skills: CatalogEntry[] }).skills;
}

describe('skills library integrity', () => {
  it('every pack directory has a catalog entry and a SKILL.md', async () => {
    const catalog = await loadCatalog();
    const names = new Set(catalog.map((entry) => entry.name));
    const directories = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect([...names].sort()).toEqual([...directories].sort());

    for (const entry of catalog) {
      const body = await readFile(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8');
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });

  it('catalog descriptions are the discovery surface: present, specific, no em-dashes', async () => {
    const catalog = await loadCatalog();
    for (const entry of catalog) {
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.description).not.toMatch(/—|…/);
    }
  });

  it('every pack stays under 150 lines and uses plain punctuation', async () => {
    const catalog = await loadCatalog();
    for (const entry of catalog) {
      const body = await readFile(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8');
      const lines = body.split('\n');
      expect(lines.length, entry.name).toBeLessThanOrEqual(150);
      expect(body, entry.name).not.toMatch(/—|…/);
    }
  });

  it('packs reference only loopback example hosts', async () => {
    const catalog = await loadCatalog();
    for (const entry of catalog) {
      const body = await readFile(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8');
      const hosts = [...body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!);
      for (const host of hosts) {
        const isLoopback = /^(localhost|127\.0\.0\.1)/.test(host);
        const isOffsite = /(^|\.)attacker\.example$|(^|\.)example\.com$/.test(host);
        expect(isLoopback || isOffsite, `${entry.name}: ${host}`).toBe(true);
      }
    }
  });
});
