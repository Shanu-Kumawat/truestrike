# Client-side vulnerabilities (DOM and prototype pollution)

Use for flaws that live in the browser: DOM XSS via client code, prototype
pollution, client-side routing abuse, client-enforced-only checks.

## Recognition

- Sinks in the bundle: innerHTML, outerHTML, document.write, eval,
  Function, jQuery $() with client-controlled strings.
- Sources: location.hash, location.search, postMessage, window.name.
- Deep-merge or user-input-to-object assignment patterns (prototype
  pollution candidates).
- Client-side route guards with no server counterpart.

## Method

1. Bundle review first: map routes and sinks from the client code (this is
   why recon saved the bundles).
2. DOM XSS: trace source to sink, craft the hash or query that reaches it,
   prove with a marker payload.
3. Prototype pollution: try polluting Object.prototype via any JSON input
   path (query params parsed client-side, deep-set APIs), then prove with
   a gadget: a known property the polluted prototype changes (for example,
   isAdmin checks defaulting falsy). Server-observable effects must go
   through the app's real endpoints.
4. Client-only enforcement: perform the action the client blocks by
   calling the API directly; if the server accepts it, the check is
   cosmetic.

## Probes

```sh
# find sinks in saved bundles
grep -n "innerHTML\|document.write\|eval(" /workspace/truestrike-report/evidence/recon/main.js | head

# prototype pollution probe via query parsing (then test a gadget)
curl -s "http://localhost:3000/#?__proto__.tsmarker=1" >/dev/null
# gadget check happens in browser context; for API-side effects:
curl -s -X POST http://localhost:3000/api/... -H 'content-type: application/json' \
  -d '{"__proto__":{"tsmarker":1}}'
```

## Proving it

- DOM XSS: payload execution evidence (marker console output or DOM
  change) plus the sink line from the bundle.
- Prototype pollution: the polluted property observed through a real
  gadget effect, saved end to end. Pollution without a gadget is probable.
- Client-only enforcement: the direct API call succeeding where the UI
  blocks it.

## Counterchecks

- Sanitizing wrappers before sinks.
- Server-side enforcement present behind client checks.
- JSON parse of bodies never reaching a deep merge.

## Impact guidance

Prototype pollution with server-observable effect (admin bypass) is high to
critical. DOM XSS follows XSS severity rules. Client-only checks: severity
of the action they were supposed to gate.
