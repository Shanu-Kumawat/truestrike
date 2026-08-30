# File handling (upload, download, traversal)

Use against file upload forms, download links, profile images, import
features, and static file servers.

## Recognition

- Upload endpoints (avatars, attachments) and any multipart handling.
- Download links whose filename or path comes from the client.
- Static file services with extension or directory restrictions.

## Method

Boundary (the normal-usage principle, consistent with every pack): using
a feature exactly as a legitimate user would - registering an account,
browsing, uploading an inert file the feature openly accepts - is ungated;
it cannot be an attack because it is indistinguishable from normal use.
Everything past that line gates: retrieving content a filter should block,
traversal reads, any crafted/hostile/polyglot upload, and any execution
attempt. The ungated upload exists only to map the surface (where files
land, how they are served); the moment content is crafted rather than
inert, it is gateway territory.

1. Upload surface: what extensions and content types are accepted, where
   files land (guessable URLs?), are they served back as content or
   executed, is content-type/sniffing controlled?
2. Filter bypass on extension: double extensions, case, trailing spaces,
   null bytes (encoded %2500 on double-decoding servers). Retrieving a
   filtered file type IS a broken access control finding, and the
   retrieval itself needs gateway approval.
3. Path traversal in download params: encoded dot-dot segments; aim at a
   known file first. Gateway approval (it reads files out of bounds).
4. Execution risk: uploading active content and having it execute is
   intrusive; gateway approval before any execution attempt.

## Probes

```sh
# upload accept (benign, feature-intended)
curl -s -X POST http://localhost:3000/file-upload -F "file=@note.txt"
```

Gateway payloads (approval carries the exact URL or file):

```sh
# extension-filter bypass retrieval
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:3000/ftp/package.json.bak%2500.md"
curl -s "http://localhost:3000/ftp/suspicious_errors.yml%2500.md" | head

# path traversal in a download param
curl -s --path-as-is "http://localhost:3000/download?file=../../etc/hostname"
```

## Proving it

- Filter bypass: the blocked file type retrieved, with the exact encoded
  path and the file content in evidence.
- Traversal: content of a known file outside the served root.
- Upload RCE needs executed-output proof (marker echo), saved end to end.

## Counterchecks

- 403 regardless of encoding tricks (filter normalizes correctly).
- Traversal sanitized to the served root.
- Uploads stored with random names and served with safe content-type.

## Impact guidance

Arbitrary file read (traversal or filter bypass to sensitive files) is high;
upload leading to stored XSS is high; upload RCE is critical; harmless file
type retrieval is low to medium.
