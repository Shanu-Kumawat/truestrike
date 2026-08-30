# CORS misconfiguration

Use when the API serves credentialed responses and reflects or wildcard-
allows origins.

## Recognition

- Access-Control-Allow-Origin headers on API responses.
- Credentials allowed (Access-Control-Allow-Credentials: true) alongside
  dynamic origin reflection.
- Preflight (OPTIONS) behavior worth mapping too.

## Method

1. Send a request with an Origin header you control and see what the
   Access-Control-Allow-Origin of the response is: reflected origin,
   wildcard, null, or a fixed allowlist entry.
2. Try variations that defeat naive allowlist logic: subdomain of the
   allowed origin that you could register in theory, the string null,
   allowed-origin suffix tricks (evil-example.com vs example.com).
3. Check credentials: reflection plus Allow-Credentials true means any
   origin can read authenticated responses in a browser.

## Probes

```sh
# origin reflection check
curl -sI http://localhost:3000/rest/products -H "Origin: https://attacker.example" | grep -i access-control

# wildcard check
curl -sI http://localhost:3000/rest/products | grep -i access-control

# allowlist suffix trick (does it match by suffix?)
curl -sI http://localhost:3000/rest/products -H "Origin: https://target.attacker.example" | grep -i access-control
```

## Proving it

- The response headers allowing your arbitrary origin, saved with the
  request that produced them.
- To prove impact: a fetch from an off-origin page reading an
  authenticated endpoint. Driving a browser for this is intrusive;
  gateway approval first. The header evidence alone supports a probable
  finding.

## Counterchecks

- Fixed legitimate origins in the allowlist (correct behavior).
- Wildcard WITHOUT credentials allowed (limited impact, often fine).
- Origin not reflected for arbitrary senders.

## Impact guidance

Credentialed reflection on data-bearing endpoints: medium to high.
Wildcard without credentials: info to low.
