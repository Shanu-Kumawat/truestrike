# SQL injection

Use when any input flows into a database query: search boxes, filters, sort
and order parameters, login forms, API query params, JSON bodies.

## Recognition

- Search/filter endpoints returning different results for `'` vs `''`.
- SQL errors (sqlite, mysql, postgres fragments) in responses or error pages.
- Endpoints where sort/order/column names are passed as parameters.
- Login endpoints where classic payloads change behavior.

## Method (read-only first)

1. Baseline: send a benign value, record status, length, and body digest.
2. Break the quote: value like `a'` and compare. An error or a length change
   on `a''` returning to baseline suggests string interpolation.
3. Boolean oracle: pair requests differing only in predicate truth, for
   example `x' AND '1'='1` vs `x' AND '1'='2`; diff length and content.
4. Determine the context: how many columns, string vs numeric, where the
   input sits (WHERE, ORDER BY, LIMIT, INSERT).
5. UNION extraction only after column count is known (ORDER BY increments
   or UNION with NULL padding).

## Probes

```sh
# boolean pair (diff these two)
curl -s "http://localhost:3000/rest/products/search?q=x'+AND+'1'%3D'1" -o r1.txt
curl -s "http://localhost:3000/rest/products/search?q=x'+AND+'1'%3D'2" -o r2.txt
diff <(wc -c <r1.txt) <(wc -c <r2.txt)

# column count via ORDER BY increments
curl -s "http://localhost:3000/rest/products/search?q=x'+ORDER+BY+10--"

# UNION with NULL padding (adjust arity)
curl -s "http://localhost:3000/rest/products/search?q=x'+UNION+SELECT+NULL,NULL,NULL--"
```

Automated extraction (sqlmap) is INTRUSIVE: route it through the gateway
with request_intrusive_approval. Manual read-only probes above are fine
without approval.

## Proving it

The PoC must demonstrate data control, not just an error:

- Extract a benign, non-user row (version() or sqlite_version()) as proof.
- Escalate to table enumeration and a specific table's columns only far
  enough to prove impact; save request/response pairs to evidence.
- An error alone is a probable, not confirmed, finding unless it leaks query
  structure or data.

## Counterchecks

- Generic 500s that also fire on any malformed input.
- Length differences caused by templating, not predicate truth; verify with
  a second oracle pair.
- Parameterized backends: `sleep` payloads that do nothing while response
  times vary with network load.

## Impact guidance

Data extraction is high; authentication bypass via injection is critical;
write-side injection (INSERT/UPDATE surfaces) escalates severity.
