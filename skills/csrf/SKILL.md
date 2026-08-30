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
3. Token check: does the request need a per-session token, and is it
   validated server-side (removing it should fail)?
4. PoC construction: a minimal HTML form or fetch page that performs the
   action as a logged-in victim. Hosting the PoC and driving a browser to
   it is intrusive; gateway approval first. Inspecting defenses is
   read-only.

## Probes

```sh
# cookie attributes
curl -sI http://localhost:3000/ | grep -i set-cookie

# is the token actually required? (own session, remove token)
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
