// Promotional Stripe trials grant the purchased plan just like active subscriptions.
export function grantsSubscriptionAccess(status: string): boolean {
  return status === "active" || status === "trialing";
}