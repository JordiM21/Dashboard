/**
 * Self-check for pickKeeper — it decides which of several duplicate rows for
 * one Stripe payment survives, and the others are deleted. Getting it wrong
 * loses the student link or keeps a wrong date on a money record.
 *
 *   npx tsx scripts/testDedupeKeeper.ts
 */

import assert from "assert";
import { pickKeeper, type Row } from "./dedupeStripeTransactions";

const row = (p: Partial<Row>): Row => ({
  id: "x",
  stripePaymentId: "pi_1",
  date: "2026-09-02",
  amount: 50,
  studentId: null,
  description: "Stripe payment — a@b.com",
  data: {},
  ...p,
});

// A row that identifies its student beats one that doesn't, even when the
// other is earlier — that link exists nowhere else.
assert.equal(
  pickKeeper([
    row({ id: "no-student", date: "2026-08-01" }),
    row({ id: "has-student", date: "2026-09-02", studentId: "stu_1" }),
  ]).id,
  "has-student"
);

// Otherwise the earliest date wins: a redelivered webhook stamped `date` with
// the day it re-ran, not the day the money moved.
assert.equal(
  pickKeeper([row({ id: "late", date: "2026-09-02" }), row({ id: "early", date: "2026-08-31" })]).id,
  "early"
);

// Same date, no student: the Checkout row beats the PaymentIntent row.
assert.equal(
  pickKeeper([
    row({ id: "intent", description: "Stripe payment — a@b.com" }),
    row({ id: "checkout", description: "Stripe checkout — a@b.com" }),
  ]).id,
  "checkout"
);

// The real c.zurita case: three rows, keep the dated-correctly one with the student.
assert.equal(
  pickKeeper([
    row({ id: "keep", date: "2026-08-31", studentId: "r5ie", description: "Stripe checkout — c.zurita1701@gmail.com" }),
    row({ id: "dupe1", date: "2026-09-02", description: "Stripe checkout — c.zurita1701@gmail.com" }),
    row({ id: "dupe2", date: "2026-09-02", description: "Stripe payment — c.zurita1701@gmail.com" }),
  ]).id,
  "keep"
);

// A single row is always its own keeper.
assert.equal(pickKeeper([row({ id: "only" })]).id, "only");

console.log("pickKeeper: ok");
