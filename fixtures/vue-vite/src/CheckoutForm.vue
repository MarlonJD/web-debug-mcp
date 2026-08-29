<script>
export default {
  name: "CheckoutForm",
  props: {
    currency: { type: String, default: "TRY" },
  },
  data() {
    return {
      amount: "249.90",
      submitted: false,
      error: null,
    };
  },
  methods: {
    submitPayment() {
      const numericAmount = Number(this.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        this.error = "Invalid amount";
        this.submitted = false;
        return;
      }
      this.error = null;
      this.submitted = true;
    },
  },
};
</script>

<template>
  <section aria-labelledby="vue-checkout-title">
    <h2 id="vue-checkout-title">Vue checkout</h2>
    <label>
      Amount ({{ currency }})
      <input v-model="amount" aria-label="Amount" />
    </label>
    <button type="button" @click="submitPayment">Submit payment</button>
    <p role="status">{{ error ?? (submitted ? `Payment submitted: ${amount}` : "Ready") }}</p>
    <p data-testid="vue-update-ready">{{ submitted ? "Updated" : "Idle" }}</p>
  </section>
</template>
