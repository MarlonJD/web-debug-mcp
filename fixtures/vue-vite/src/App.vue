<script>
import CheckoutForm from "./CheckoutForm.vue";

export default {
  name: "App",
  components: { CheckoutForm },
};
</script>

<template>
  <main>
    <h1>Vue checkout fixture</h1>
    <CheckoutForm currency="TRY" />
  </main>
</template>
