# Access control (IDOR and privilege escalation)

Use against every endpoint that references an object by id or name, and
every transition between user roles.

## Recognition

- REST paths or params carrying numeric ids, usernames, or object names.
- Admin-flavored endpoints (/api/Users, /rest/admin) reachable by URL.
- Responses containing other users' data after an id change.

## Method

1. Establish two of your own accounts (A and B) with different privilege
   if the app allows role differences at registration.
2. Horizontal: with A's session, request B's objects by id (orders,
   profiles, baskets, memories, feedback). A 200 with B's data is the bug.
3. Vertical: as a normal user, request admin surfaces directly by URL;
   forced browsing is read-only until state changes.
4. Mass assignment: adding privilege fields (role, isAdmin) to an update
   is a state-changing privilege-escalation attempt: gateway approval
   first.
5. State-changing IDOR (deleting or modifying B's object as A) is
   intrusive: gateway approval first, and use your own accounts.

Reads with your own two accounts (steps 2-3) are ungated; every write or
privilege mutation goes through the gateway.

## Probes

```sh
# horizontal IDOR: B's basket seen with A's token
curl -s http://localhost:3000/rest/basket/2 -H "Authorization: Bearer <A-token>"

# vertical: forced browse to admin surface as normal user
curl -s http://localhost:3000/api/Users -H "Authorization: Bearer <A-token>"

```

Gateway payload (approval carries the exact request):

```sh
# mass assignment attempt
curl -s -X PATCH http://localhost:3000/api/Users/1 -H 'content-type: application/json' \
  -H "Authorization: Bearer <A-token>" -d '{"role":"admin"}'
```

## Proving it

- Save: request with A's token, response containing B's (or admin) data,
  and the two account setups so the proof is reproducible.
- For escalation, show the privilege actually changed behavior (an
  admin-only action succeeding), not just the field updating.

## Counterchecks

- Object ownership enforced server-side (403/404 for B's id with A's token).
- Admin endpoints gated by role checks regardless of route knowledge.
- Extra fields silently stripped on update (mass assignment defended).

## Impact guidance

Read access to other users' private data is high; write/delete access is
high to critical; privilege escalation to admin is critical. API-wide data
exposure (anonymous access to all users) is critical.
