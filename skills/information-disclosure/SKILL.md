# Information disclosure

Use throughout the engagement: errors, headers, files, and API responses
that reveal more than they should.

## Recognition

- Verbose error pages with stack traces, SQL fragments, paths, versions.
- Interesting files: backups (.bak, .old, ~), configs, source maps,
  /ftp-style static directories, exposed .git or .env.
- APIs returning more fields than the UI shows (over-fetching).
- Headers and cookies leaking stack details.

## Method

1. Error induction with malformed input across input types; note which
   endpoints leak internals.
2. Directory and file probing with focused wordlists for backup and config
   names near known routes.
3. Diff API responses against UI display: jq keys sorted, fields the UI
   never renders (passwords, hashes, internal ids, tokens).
4. Client bundle review: source maps (.map files next to bundles), comments,
   internal API routes and feature flags in shipped code.
5. Standard exposed paths: robots.txt entries pointing somewhere odd,
   /metrics, /health, debug routes.

## Probes

```sh
# error induction
curl -s "http://localhost:3000/rest/products/search?q=%27"

# backup/config wordlist pass on interesting prefixes
ffuf -u http://localhost:3000/FUZZ -w backups.txt -mc 200,403

# API over-fetch: fields the UI does not render
curl -s http://localhost:3000/rest/user/whoami | jq 'keys'
curl -s http://localhost:3000/rest/user/login -X POST -H 'content-type: application/json' \
  -d '{"email":"x@x.example","password":"x"}' | jq 'keys'

# static file directory with extension filtering
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/ftp/package.json.bak
```

## Proving it

- Save the response containing the leaked information: the stack trace, the
  hashed password, the backup file content excerpt.
- Version disclosure alone is low/info; secrets, credentials, or user data
  raise it.

## Counterchecks

- Generic error handlers that reveal nothing.
- Files that exist but are filtered correctly (403 with no content).
- API fields that are harmless metadata (timestamps), not private data.

## Impact guidance

Credentials or password hashes disclosed: high to critical. Stack traces
with versions: low. Internal paths alone: info. User data over-fetch:
medium to high depending on fields.
