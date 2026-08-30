# Dependency and version exposure

Use when recon surfaces library, framework, or server versions; turn
disclosed versions into known-CVE candidates.

## Recognition

- Version strings in headers (X-Powered-By, Server), HTML generators,
  asset URLs, error pages, API payloads.
- Client bundle comments and library banners with versions.
- Manifest-like files accidentally served (package manifests, lockfiles).

## Method

1. Collect every version-bearing artifact during recon into evidence.
2. Map each to its library; check known public advisories from your
   knowledge. Do not fabricate CVEs: only cite issues you are certain of
   for the exact version.
3. nuclei templates encode many version checks: a focused nuclei run
   against the target with version-detection templates is acceptable as a
   hypothesis generator (see web-recon rules).
4. A known-vulnerable version is a probable finding until an impact path
   is demonstrated on this target. Demonstrating exploitation is
   intrusive: gateway approval first.

## Probes

```sh
# version-bearing headers
curl -sI http://localhost:3000/ | grep -i "x-powered-by\|server"

# generator and library banners in markup
curl -s http://localhost:3000/ | grep -i -o "generator[^>]*\|v[0-9]\+\.[0-9]\+\.[0-9]\+" | head

# focused nuclei version-detection pass (hypotheses only)
nuclei -u http://localhost:3000 -tags tech,detect -severity info,low
```

## Proving it

- The disclosed version (evidence artifact) plus the advisory you can name
  with certainty: status probable.
- Confirmed requires a demonstrated impact path on this target, executed
  behind gateway approval when intrusive.
- Guessed or approximate CVEs must never reach findings.json.

## Counterchecks

- Versions that look vulnerable but run patched distributions.
- Components present but unused code paths (note as info).
- Version strings that are decoys or marketing.

## Impact guidance

Unexposed-vulnerable-but-unused: info to low. Exposed and remotely
exploitable: high to critical. Most findings in this class for a demo
target land at low/probable without deeper exploitation.
