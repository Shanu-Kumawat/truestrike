# Cross-site request forgery (CSRF)

Use against state-changing endpoints: password change, email change, cart
modification, role changes, anything with side effects.

## Recognition

- State-changing POST/PUT/DELETE endpoints authenticated by cookie.
- Absence of CSRF tokens or SameSite cookie protection.
- Content-type restrictions that can be bypassed with form encodings.

## Method

1. Identify state-changing endpoints and their auth mechanism (cookie vs
   header token). Header-token APIs are not CSRF-able via forms.
2. Cookie check: cookie flags, SameSite attribute on the session cookie.
3. Token presence check (passive): does the client attach a per-session
   token to state-changing requests? Absence is already a strong signal.
4. Token enforcement check and PoC execution: sending a state-changing
   request without its token PERFORMS the action if enforcement is missing,
   so both the enforcement probe and the forged-PoC execution go through
   the gateway. Inspecting cookies and headers is read-only.

## Probes

```sh
# cookie attributes (passive)
curl -sI http://localhost:3000/ | grep -i set-cookie
```

Gateway payload (token-enforcement probe; approval carries the request):

```sh
curl -s -X POST http://localhost:3000/rest/savexhr -H "Cookie: <session>" \
  -H 'content-type: application/json' -d '{}' -o /dev/null -w '%{http_code}\n'
```

## Proving it

- The forged request succeeding in a browser context as the victim. Build
  the PoC page, get approval, execute it against your own second account,
  and save the resulting state change.
- Defense present (token required, SameSite strict) means the finding is
  not confirmed.

## Counterchecks

- SameSite=Lax/Strict on the session cookie blocks most form-based CSRF.
- Server-enforced per-request tokens that fail when removed.
- Pure header-token auth with no cookie: CSRF class does not apply.

## Impact guidance

State change limited to the victim's own data: medium. Password or email
change enabling takeover: high. Admin actions reachable: high to critical.
