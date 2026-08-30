# Open redirect

Use when a parameter controls where the response or the browser is sent:
return urls, next params, logout targets, link shorteners.

## Recognition

- Redirect responses (301/302) whose Location contains user input.
- Client-side redirects: javascript assigning location from a parameter.
- Parameters named url, next, target, return, continue, r.

## Method

1. Supply your own benign domain as the parameter value and observe where
   the Location header or client code sends the browser.
2. Scheme-relative (//attacker.example) and encoded variants to bypass naive
   prefix checks that require the target host in the value.
3. Distinguish server-side (Location header) from client-side (script)
   redirects; note which context applies.

## Probes

```sh
# header redirect with attacker-controlled destination (local stand-in
# origin on another port proves arbitrary-destination control)
curl -sI "http://localhost:3000/redirect?to=http://127.0.0.1:9999/tsmarker" | grep -i location

# scheme-relative bypass of prefix checks (reserved .example TLD)
curl -sI "http://localhost:3000/redirect?to=//attacker.example/tsmarker" | grep -i location

# encoded variant
curl -sI "http://localhost:3000/redirect?to=http%3A%2F%2F127.0.0.1%3A9999%2Ftsmarker" | grep -i location
```

## Proving it

- A Location header (or a script redirect) pointing to an arbitrary
  origin you chose (the stand-in host stands in for an attacker domain in
  a real engagement). Save the request and the header/response.
- Same-site-only redirects are not the finding.

## Counterchecks

- Allowlist of redirect targets enforced server-side.
- The parameter only accepts relative paths.
- The redirect happens client-side with validation before assignment.

## Impact guidance

Low on its own; medium when the redirect lives on a trusted path used in
emails or after login (phishing credibility). Combined with token leakage
in the redirect it escalates.
