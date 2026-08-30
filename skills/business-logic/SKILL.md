# Business logic

Use where correctness of the workflow itself is the vulnerability: money
and quantity math, multi-step flows, coupon and discount handling, ordering
and checkout.

## Recognition

- Quantities, prices, totals, discounts in requests or client-computed and
  sent to the server.
- Multi-step flows (order, pay, confirm) with state passed between steps.
- Coupons, gift cards, wallet credits, refunds, reviews.

## Method

1. Map the flow end to end as a normal user; record every state transition
   and where trust boundaries sit (does the server recompute totals?).
2. Numeric abuse: negative quantities, zero, huge values, floats with
   rounding tricks, string numbers; watch totals and stock.
3. Price tampering: if the client sends a price or total, change it.
4. Coupon abuse: reuse, cross-user, stack, expired, wrong-case; invalid
   discount codes with format quirks.
5. Race conditions: submitting the same coupon or checkout twice in
   parallel. Parallel writes are intrusive: gateway approval first.
6. Workflow bypass: skip steps, replay step 3 twice, complete flow out of
   order.

## Probes

```sh
# negative quantity
curl -s -X POST http://localhost:3000/api/BasketItems -H 'content-type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"BasketId":"1","ProductId":"1","quantity":-5}'

# coupon reuse (sequential; parallel replay needs approval)
curl -s -X PUT http://localhost:3000/rest/basket/1/coupon/<CODE> -H "Authorization: Bearer <token>"
curl -s -X PUT http://localhost:3000/rest/basket/1/coupon/<CODE> -H "Authorization: Bearer <token>"
```

## Proving it

- Show the math: original total, tampered input, resulting total, and the
  completed order or transaction state. One screenshot-equivalent artifact
  per claim.
- A manipulated total that the checkout accepts is confirmed; a tampered
  price rejected at order time is a defended flow.

## Counterchecks

- Server recomputes totals (client tampering has no effect).
- Negative quantities rejected or clamped.
- Coupon single-use enforced server-side.

## Impact guidance

Direct financial manipulation (paying less, credits from nothing) is high;
workflow bypass reaching free goods or refunds is high to critical;
quantity rounding quirks are medium unless exploitable at scale.
