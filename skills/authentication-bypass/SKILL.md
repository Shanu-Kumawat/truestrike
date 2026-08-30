# Authentication bypass

Use against login, registration, password reset, session handling, and any
endpoint that distinguishes authenticated from anonymous requests.

## Recognition

- Login flows (form or JSON API), token issuance, password reset with
  security questions, CAPTCHA-gated endpoints.
- Enumeration surfaces: distinct responses for unknown vs wrong-password.
- Registration flows that accept role or privilege fields.

## Method

1. Map the auth model first: what identifies a session (cookie, bearer,
   both), how login succeeds and fails, what a protected endpoint returns
   when anonymous.
2. Credential testing beyond a couple of manual attempts is brute force:
   intrusive, gateway approval required. The exception is documented default
   or well-known test credentials for the demo target class (check for a
   default admin account as a single manual attempt).
3. Password reset abuse: can security questions be enumerated or brute
   forced (that is brute force too), can reset tokens be predicted, does
   reset leak whether an account exists?
4. Registration abuse: submit privilege fields (role, isAdmin) and observe
   whether they persist (also see access-control skill).
5. Session flaws: cookie flags, token expiry behavior, logout actually
   invalidating server-side, tokens valid after password change.

## Probes

```sh
# enumeration oracle: compare these two responses
curl -s -X POST http://localhost:3000/rest/user/login -H 'content-type: application/json' \
  -d '{"email":"nosuch@example.com","password":"x"}'
curl -s -X POST http://localhost:3000/rest/user/login -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"x"}'

# default credentials (single manual attempt)
curl -s -X POST http://localhost:3000/rest/user/login -H 'content-type: application/json' \
  -d '{"email":"admin@juice-sh.op","password":"admin123"}'

# anonymous vs authenticated access to the same endpoint
curl -s http://localhost:3000/rest/user/whoami
```

## Proving it

- Enumeration: two responses differing only in account-existence signal,
  saved as a pair.
- Default/weak credentials: the successful login response with the token.
- Reset abuse: the reset completed for an account you control proving the
  mechanism, then the flaw demonstrated safely.
- Brute force success requires gateway approval before the attempt.

## Counterchecks

- Same error for both enumeration probes (good design, not vulnerable).
- CAPTCHA or rate limits that actually gate repeated attempts (do not try
  to bypass without approval; note and move on).

## Impact guidance

Account takeover of an arbitrary user is critical to high; enumeration
alone is low to medium; weak reset tokens are high if they allow takeover.
