# File handling (upload, download, traversal)

Use against file upload forms, download links, profile images, import
features, and static file servers.

## Recognition

- Upload endpoints (avatars, attachments) and any multipart handling.
- Download links whose filename or path comes from the client.
- Static file services with extension or directory restrictions.

## Method

1. Upload surface: what extensions and content types are accepted, where
   files land (guessable URLs?), are they served back as content or
   executed, is content-type/sniffing controlled?
2. Filter bypass on extension: double extensions, case, trailing spaces,
   null bytes (encoded %2500 on double-decoding servers), less-common but
   executable forms. Retrieving a filtered file type IS a broken access
   control finding even without executing anything.
3. Path traversal in download params: encoded dot-dot segments; aim at a
   known file first.
4. Execution risk: uploading active content and having it execute is
   intrusive; gateway approval before any execution attempt. Retrieving a
   file that the filter should block is a read-only proof.

## Probes

```sh
# upload accept (benign)
curl -s -X POST http://localhost:3000/file-upload -F "file=@note.txt"

# extension-filter bypass (retrieval proof)
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
