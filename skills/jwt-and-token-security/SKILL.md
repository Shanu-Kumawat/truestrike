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
   claim. Transmitting ANY modified or forged token is a forgery attempt:
   gateway approval required, always, regardless of which account it names.
3. Weak HMAC secret: testing candidate secrets offline against a captured
   token's signature is passive and ungated. Sending a re-signed token to
   the server is a forgery attempt: gateway approval.
4. RS/HS confusion: when the server publishes its public key (jwks or
   similar endpoint), build the HS* re-signature with the public key bytes
   offline freely; sending it to the server needs gateway approval.
5. Claim trust: can exp be omitted, is the identity claim the one checked,
   do extra claims (role, admin) change authorization?

## Probes

```sh
# decode offline (no requests); pass the token as an argument
python3 -c 'import base64,json,sys; pad=lambda x:x+"="*(-len(x)%4); h,p,_=sys.argv[1].split("."); print(json.loads(base64.urlsafe_b64decode(pad(h)))); print(json.loads(base64.urlsafe_b64decode(pad(p))))' "<token>"
```

Sending any forged or modified token (alg:none, weak-secret signature,
RS/HS confusion) requires gateway approval first; the approval carries the
exact token you will send.

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
