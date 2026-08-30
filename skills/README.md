# TrueStrike skills

TrueForge git-backed skill packs configured from this repository. TrueForge
advertises each configured skill by name + description in the agent's system
prompt; the agent reads the SKILL.md from the sandbox on demand.

## Two tiers

- **Process skills** (always attached): `web-recon`, `vuln-validation`,
  `report-writing`. How to work: method, discipline, artifact contract.
- **Reference skills** (on-demand library): one pack per vulnerability
  class. What to test: recognition signals, ordered method, tool-grounded
  probes, proof requirements, counterchecks, impact guidance. The agent
  reads the class pack when the target's surface matches.

The library is depth, not a boundary: the doctrine explicitly instructs the
agent to investigate beyond it and never to guess payloads from memory when
a relevant pack exists.

## Adding a pack

1. Create `skills/<name>/SKILL.md` (original text only, no em-dashes, plain
   punctuation, loopback-host examples only).
2. Add the name + description to `skills/skills.json` (the description is
   the agent's discovery surface: name the class and the triggers).
3. Run `node scripts/configure-skills.mjs` against your TrueForge server to
   register or update it.
4. Scans pick it up automatically when `TRUESTRIKE_SKILLS` is `*` (the
   default), which attaches every configured skill.

## Updating all packs after changes

```sh
node scripts/configure-skills.mjs   # re-PUTs every pack in skills.json
```
