# Command injection

Use when input may reach a shell or process spawn: file names, conversion
tools, PDF generators, import/export features, ping/traceroute utilities,
webhooks.

## Recognition

- Features that name files, invoke converters, or call system binaries.
- Error messages revealing shell syntax (sh: 1: ...).
- Endpoints accepting filenames, URLs, or format arguments.
- Legacy utilities exposing network diagnostics.

## Method (read-only first)

1. Time-based detection is the quietest oracle: a separator plus a delay
   command (`;sleep 5`, `|sleep 5`, backtick variants) and diff response
   times against baseline.
2. Separator probing: try `;`, `|`, `&&`, `\n`, backticks; some survive
   filtering.
3. Output-based proof: separator plus an echo of a unique marker, then grep
   the response for the marker.
4. Blind without output: out-of-band via a DNS or HTTP callback you control
   is intrusive; gateway approval first.

## Probes

```sh
# time oracle pair
time curl -s "http://localhost:3000/some/convert?file=a;sleep+5" -o /dev/null
time curl -s "http://localhost:3000/some/convert?file=a" -o /dev/null

# output oracle
curl -s "http://localhost:3000/some/convert?file=a;echo+tsmarker" | grep tsmarker
```

Running anything beyond sleep/echo against the target, reading files via the
injection, or OOB callbacks: intrusive, gateway approval required.

## Proving it

- A repeatable time delta with the payload present and absent, PLUS a marker
  echo or equivalent output proof. Time alone is probable, not confirmed.
- Save both timing transcripts and the response containing the marker.

## Counterchecks

- Delays caused by heavy processing on the benign request itself.
- Escaped separators visible in the response as literal text.
- Sandboxed server-side executors that swallow commands silently.

## Impact guidance

RCE on the application host is critical. Where the executor is constrained
(a specific allowlisted binary), report what was actually demonstrated.
