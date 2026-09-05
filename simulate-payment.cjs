// simulate-payment.js
//
// Simulates a NOWPayments IPN webhook call so you can test the
// "payment confirmed -> user marked paid -> Telegram invite generated"
// flow WITHOUT sending any real crypto.

const crypto = require("crypto");

// ====================== CONFIG ======================
const IPN_SECRET = "B/SPwU2DYy+ZXWYk4OyWlFHUqbzgZM55"; // <-- only this one you must fill in yourself
const ORDER_ID = "cad3a452-cb1f-4c2d-9de6-efd5ac13ba7e";
const WEBHOOK_URL = "https://exclusivementorship.xyz/api/webhooks/nowpayments";
const PAYMENT_STATUS = "finished";
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
  if (IPN_SECRET.startsWith("PASTE_")) {
    console.error("Fill in IPN_SECRET at the top of this file first.");
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