# Cross-site scripting (XSS)

Use when input is reflected into HTML, stored and served back, or executed
in DOM context via JavaScript sinks.

## Recognition

- Reflected: parameter values echoed in the response HTML.
- Stored: profile fields, comments, names, any persisted text rendered later.
- DOM: client code writing input into innerHTML, document.write, eval, or
  building HTML from location.hash or postMessage data.

## Method

1. Map reflection contexts with a benign marker: `marker123` in every
   parameter; find where it lands (HTML body, attribute, script block,
   comment, URL).
2. Contextual break attempts: what closes the context (`"`, `'>`, `</script>`,
   backtick) and what filters apply (encoding, tag stripping, CSP).
3. Escalate marker to alert-grade payload ONLY with a harmless function
   (`console.log` or a unique DOM change) when proving; the report PoC can
   show the exact string.
4. For stored: submit in one request, prove persistence by fetching the
   rendered view in a second, then confirm with the raw response.
5. For DOM: read the client bundle, locate the sink, and craft the hash or
   parameter path that reaches it.

## Probes

```sh
# reflection mapping
curl -s "http://localhost:3000/search?q=marker123" | grep -n marker123

# attribute-context break
curl -s "http://localhost:3000/search?q=%22%3Emarker123" | grep -n marker123

# stored: submit then fetch the rendered page
curl -s -X POST http://localhost:3000/api/Feedbacks -H 'content-type: application/json' \
  -d '{"comment":"marker456","rating":1}'
curl -s http://localhost:3000/ | grep -n marker456
```

## Proving it

- Reflection WITH executable context broken is confirmed; reflection into
  escaped text is NOT XSS.
- Save: the exact request, the exact response snippet showing the payload
  surviving unescaped, and the sink line from the bundle for DOM cases.
- A CSP header that blocks inline execution changes impact, not presence.

## Counterchecks

- HTML-entitied output (`&lt;script&gt;`) is properly encoded, not vulnerable.
- Reflection inside a script string that is itself parsed safely.
- CSP with no unsafe-inline makes most DOM XSS unexploitable in that page.

## Impact guidance

Session theft potential raises severity; reflected in a parameter others can
be tricked into clicking is medium; stored XSS rendered to other users is
high; admin-context stored XSS is critical.
