let nextRequestId = 0;

export function requestQuote({ quantity, coupon }) {
  const requestId = ++nextRequestId;
  const delayMs = requestId % 2 === 1 ? 220 : 35;
  const base = 39.9 * quantity;
  const discount = coupon.trim().toUpperCase() === "SAVE20" ? base * 0.2 : 0;
  const total = Number((base - discount + 15).toFixed(2));

  return new Promise((resolve) => {
    setTimeout(() => resolve({ requestId, total }), delayMs);
  });
}
