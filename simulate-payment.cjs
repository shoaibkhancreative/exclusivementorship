// simulate-payment.js
//
// Simulates a NOWPayments IPN webhook call so you can test the
// "payment confirmed -> user marked paid -> lessons unlocked" flow WITHOUT
// sending any real crypto.

const crypto = require("crypto");

// ====================== CONFIG ======================
// SECURITY: never hardcode the real IPN secret here. This file is committed
// to git, so anything typed in directly ends up in the repo (and its
// history) permanently. Pass the secret via an environment variable at run
// time instead, e.g.:
//   IPN_SECRET="..." ORDER_ID="..." node simulate-payment.cjs
const IPN_SECRET = process.env.IPN_SECRET || "PASTE_YOUR_NOWPAYMENTS_IPN_SECRET_HERE";
const ORDER_ID = process.env.ORDER_ID || "PASTE_A_REAL_ORDER_ID_HERE";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:8787/api/webhooks/nowpayments";
const PAYMENT_STATUS = process.env.PAYMENT_STATUS || "finished";
// ======================================================================

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

async function main() {
  if (IPN_SECRET.startsWith("PASTE_") || ORDER_ID.startsWith("PASTE_")) {
    console.error("Set IPN_SECRET and ORDER_ID (as env vars, not hardcoded) before running this.");
    console.error('Example: IPN_SECRET="..." ORDER_ID="..." node simulate-payment.cjs');
    process.exit(1);
  }

  const payload = {
    payment_id: "sim-" + Date.now(),
    payment_status: PAYMENT_STATUS,
    order_id: ORDER_ID
  };

  const sortedPayload = sortObjectKeys(payload);
  const serialized = JSON.stringify(sortedPayload);

  const signature = crypto
    .createHmac("sha512", IPN_SECRET)
    .update(serialized)
    .digest("hex");

  console.log("Sending simulated IPN:", serialized);

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nowpayments-sig": signature
    },
    body: serialized
  });

  const text = await res.text();
  console.log("HTTP", res.status, text);

  if (res.status === 401) {
    console.log("\n-> 401 means the signature was rejected. Double-check IPN_SECRET matches");
    console.log("   exactly what you set with `wrangler secret put NOWPAYMENTS_IPN_SECRET`.");
  } else if (res.status === 404) {
    console.log("\n-> 404 means ORDER_ID wasn't found. Double-check you copied it correctly.");
  }
}

main();