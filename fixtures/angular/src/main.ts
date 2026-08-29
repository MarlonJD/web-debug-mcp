import { Component, Input } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

@Component({
  selector: "checkout-panel",
  standalone: true,
  template: `
    <section aria-labelledby="angular-checkout-title">
      <h2 id="angular-checkout-title">Angular checkout</h2>
      <label>
        Amount ({{ currency }})
        <input aria-label="Amount" [value]="amount" (input)="updateAmount($event)" />
      </label>
      <button type="button" (click)="submitPayment()">Submit payment</button>
      <p role="status">{{ status }}</p>
      <p data-testid="angular-change-ready">{{ submitted ? "Changed" : "Idle" }}</p>
    </section>
  `,
})
export class CheckoutPanelComponent {
  @Input() currency = "TRY";
  amount = "249.90";
  submitted = false;
  status = "Ready";

  updateAmount(event: Event): void {
    this.amount = (event.target as HTMLInputElement).value;
    this.submitted = false;
    this.status = "Ready";
  }

  submitPayment(): void {
    const numericAmount = Number(this.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      this.status = "Invalid amount";
      this.submitted = false;
      return;
    }
    this.status = `Payment submitted: ${this.amount}`;
    this.submitted = true;
  }
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CheckoutPanelComponent],
  template: `
    <main>
      <h1>Angular checkout fixture</h1>
      <checkout-panel currency="TRY" />
    </main>
  `,
})
export class AppComponent {
  title = "Angular checkout fixture";
}

bootstrapApplication(AppComponent).catch((error) => console.error(error));
