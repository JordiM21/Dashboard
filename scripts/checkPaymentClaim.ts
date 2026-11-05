/** Self-check that one Stripe payment moves a due date once: npx tsx scripts/checkPaymentClaim.ts */
import assert from "node:assert";
import { decidePaymentEvent as decide } from "../functions/src/paymentReceiver";

const INTENT = 1;
const CHECKOUT = 2;

// The payment_intent event lands first and claims the move.
assert.deepEqual(decide(undefined, INTENT), { duplicate: false, claim: true });
// The checkout event lands while that claim is held: it may upgrade the row, not move the date again.
assert.deepEqual(decide({ rank: INTENT, studentApplied: true }, CHECKOUT), { duplicate: false, claim: false });
// The first event matched nobody and released its claim: the checkout event gets its turn.
assert.deepEqual(decide({ rank: INTENT, studentApplied: false }, CHECKOUT), { duplicate: false, claim: true });
// Checkout first, then the poorer event or a redelivery: ignored.
assert.deepEqual(decide({ rank: CHECKOUT, studentApplied: true }, INTENT), { duplicate: true, claim: false });
assert.deepEqual(decide({ rank: CHECKOUT, studentApplied: true }, CHECKOUT), { duplicate: true, claim: false });

console.log("ok");
