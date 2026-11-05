/**
 * Temporary "free for everyone" mode (growth/marketing period).
 *
 * Controlled by the `NEXT_PUBLIC_FREE_MODE` environment variable so the whole
 * paid system (plans, credits, add-ons, vouchers) can be switched off and back
 * on with a single env change — no code deletion required.
 *
 * When enabled:
 *  - all feature gates and credit metering are bypassed (unlimited usage);
 *  - product/plan limits resolve to unlimited;
 *  - billing mutations are disabled while reads keep working;
 *  - the billing page and landing pricing section show free-mode messaging.
 *
 * Set `NEXT_PUBLIC_FREE_MODE=true` to enable, anything else to disable.
 */
export function isFreeMode(): boolean {
  return process.env.NEXT_PUBLIC_FREE_MODE === "true";
}
