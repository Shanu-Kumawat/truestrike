# SQL injection

Use when any input flows into a database query: search boxes, filters, sort
and order parameters, login forms, API query params, JSON bodies.

## Recognition

- Search/filter endpoints returning different results for `'` vs `''`.
- SQL errors (sqlite, mysql, postgres fragments) in responses or error pages.
- Endpoints where sort/order/column names are passed as parameters.
- Login endpoints where classic payloads change behavior.

## Method

DETECT (no approval): probes that change nothing and extract nothing.
EXPLOIT (gateway): any data extraction or metadata retrieval, including
UNION SELECT, version() calls, table enumeration, and every sqlmap run.
The boundary is deliberate: detection flows freely; taking data out of the
database is active exploitation and pauses for the operator.

1. Baseline: send a benign value, record status, length, and body digest.
   Save this control response; every later claim is a diff against it.
2. Break the quote: value like `a'` and compare. An error or a length change
   on `a''` returning to baseline suggests string interpolation.
3. Boolean oracle: pair requests differing only in predicate truth, for
   example `x' AND '1'='1` vs `x' AND '1'='2`; diff length and content.
4. Determine the context: how many columns, string vs numeric, where the
   input sits (WHERE, ORDER BY, LIMIT, INSERT).

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

Everything beyond detection is gateway territory: UNION data retrieval,
version()/metadata extraction, table enumeration, and all sqlmap runs.
Request approval with the exact payload before sending.

## Proving it

The PoC must demonstrate data control, not just an error:

- Extract a benign, non-user value (sqlite_version()) as the first proof,
  behind gateway approval.
- Escalate to a specific table's columns only far enough to prove impact;
  save the payload request, its response, AND the baseline control response.
- An error alone is a probable, not confirmed, finding unless it leaks query
  structure or data.

## DBMS quick facts

- SQLite (this target family): no sleep primitive (skip time-based;
  boolean/error/UNION carry the work), sqlite_version(), recursive CTEs.
- MySQL: SLEEP(), @@version, LOAD_FILE/INTO OUTFILE (write side is out of
  scope beyond stating the capability).
- PostgreSQL: pg_sleep(), version(), COPY programs (privileged).
- Filter bypass fragments when payloads are blocked: `/**/` for spaces,
  `UN/**/ION` keyword splitting, case folding, hex literals, double
  URL-encoding.

## Counterchecks

- Generic 500s that also fire on any malformed input.
- Length differences caused by templating, not predicate truth; verify with
  a second oracle pair.
- Parameterized backends: `sleep` payloads that do nothing while response
  times vary with network load.

## Impact guidance

Data extraction is high; authentication bypass via injection is critical;
write-side injection (INSERT/UPDATE surfaces) escalates severity.
