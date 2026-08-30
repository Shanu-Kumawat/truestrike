# Command injection

Use when input may reach a shell or process spawn: file names, conversion
tools, PDF generators, import/export features, ping/traceroute utilities,
webhooks.

## Recognition

- Features that name files, invoke converters, or call system binaries.
- Error messages revealing shell syntax (sh: 1: ...).
- Endpoints accepting filenames, URLs, or format arguments.
- Legacy utilities exposing network diagnostics.

## Method

Every command-injection payload attempts target-side command execution, and
delay payloads degrade target responsiveness: ALL payload transmission is
gateway territory, including single sleep or echo probes. Ungated work is
passive only: malformed input whose error messages reveal shell syntax, and
mapping the feature. When approved:

1. Time oracle: separator plus a delay command, diffed against baseline
   timings.
2. Separator probing: `;`, `|`, `&&`, newline, backticks; some survive
   filtering.
3. Output proof: separator plus an echo of a unique marker, grepped from
   the response.
4. Blind without output: out-of-band via a callback you control; also
   gateway territory.

## Probes (each sent only after gateway approval)

```sh
# time oracle pair
time curl -s "http://localhost:3000/some/convert?file=a;sleep+5" -o /dev/null
time curl -s "http://localhost:3000/some/convert?file=a" -o /dev/null

# output oracle
curl -s "http://localhost:3000/some/convert?file=a;echo+tsmarker" | grep tsmarker
```

The probes above are the approval payloads: the exact command string goes
into the request_intrusive_approval call before anything is sent.

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
