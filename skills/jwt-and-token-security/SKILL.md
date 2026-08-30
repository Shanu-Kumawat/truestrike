# JWT and token security

Use when the app uses JWTs or structured bearer tokens anywhere in auth.

## Recognition

- Authorization headers with three dot-separated base64 segments.
- Tokens in cookies, localStorage references in the client bundle, token
  refresh endpoints.
- Algorithms referenced in client code or error messages.

## Method

1. Decode the token offline (base64url of header and payload; python or
   `jq`): record alg, exp, claims, and any key identifiers.
2. alg:none attack: drop the signature, set alg to none, modify a benign
   claim (id or email of your own test account), send. This is an
   authentication-bypass attempt: gateway approval if it escalates beyond
   your own account.
3. Weak HMAC secret: if the app signs HS* with a guessable secret, forging
   is possible. Trying a small set of obvious secrets on YOUR OWN account
   token is a read-only test; forging other identities requires approval.
4. RS/HS confusion: when the server publishes its public key (jwks or
   similar endpoint), try re-signing the token as HS* with the public key
   bytes as the secret. Approval required before sending any forged token
   for an identity that is not yours.
5. Claim trust: can exp be omitted, is the identity claim the one checked,
   do extra claims (role, admin) change authorization?

## Probes

```sh
# decode offline (no requests)
python3 - <<'PY'
import base64, json, sys
h, p, s = sys.argv[1].split('.')
pad = lambda x: x + '=' * (-len(x) % 4)
print(json.loads(base64.urlsafe_b64decode(pad(h))))
print(json.loads(base64.urlsafe_b64decode(pad(p))))
PY

# alg:none with your own account id (observe response only)
curl -s http://localhost:3000/rest/user/whoami \
  -H "Authorization: Bearer <modified-token>"
```

## Proving it

- A forged or stripped-signature token that the server accepts, with the
  response proving the accepted identity. Save the original token, the
  forged token, and the response.
- alg:none acceptance for a nonexistent identity is a strong probable;
  acceptance for your own account is already confirmed bypass of integrity.

## Counterchecks

- Server rejects none/alg-mismatched tokens (good).
- Public key present but server pins the algorithm correctly (confusion
  fails; report nothing).

## Impact guidance

Arbitrary-identity forgery is critical. Own-account signature bypass is
high (integrity broken, escalation likely).
