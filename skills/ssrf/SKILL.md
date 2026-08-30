# Server-side request forgery (SSRF)

Use when the server fetches a URL you influence: profile-picture-from-URL,
webhooks, importers, PDF generators, preview features.

## Recognition

- Parameters that look like URLs (url=, link=, callback=, webhook=).
- Features documented as fetching remote content.
- Error differences between reachable and unreachable URLs you supply.

## Method

1. Point the feature at a server you control or a well-known public
   endpoint and see if the fetch happens (response content or callback).
2. Internal targeting (metadata endpoints, localhost services, internal
   hostnames) is intrusive against the target's infrastructure: gateway
   approval before probing internal addresses.
3. Scheme and redirect abuse: file://, gopher-style (if the stack supports
   them), redirects from your URL to an internal one. Approval first.
4. Blind SSRF: when no output returns, use timing or your controlled
   callback as the oracle.

## Probes

```sh
# does the server fetch? (your own endpoint or a public one)
curl -s -X POST http://localhost:3000/profile/image -H 'content-type: application/json' \
  -d '{"url":"https://example.com/tsmarker.png"}'

# internal probing requires approval; typical shape after approval:
curl -s -X POST http://localhost:3000/profile/image -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1:8080/"}'
```

## Proving it

- Evidence the server made the request you specified: fetched content in
  the response, or a callback hit on infrastructure you control, saved with
  timestamps.
- Internal network reachability from the app server raises impact.

## Counterchecks

- URL allowlists blocking external and internal targets alike.
- The fetch happening client-side (browser), not server-side: not SSRF.
- Feature disabled or parameter ignored.

## Impact guidance

Read of internal services or cloud metadata: critical to high. Blind SSRF
to arbitrary hosts: medium to high. Open-fetch of public URLs only: low.
