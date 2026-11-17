/** Assignable staff permissions; imported by the UI and the invitation handler. */
export const STAFF_ACCESS_AREAS = [
  { id: 'calendar', label: 'Calendar', description: 'Manage the lesson calendar.', route: '/admin/calendar' },
  { id: 'pro_zone', label: 'Pro Zone', description: 'Manage the Pro Zone media library.', route: '/admin/pro-zone' },
  { id: 'plans_billing', label: 'Plans & Billing', description: 'Manage membership plans and billing configuration.', route: '/admin/plans-billing' },
  { id: 'lesson_pricing', label: 'Lessons & Pricing', description: 'Manage lesson types and pricing.', route: '/admin/pricing' },
  { id: 'google_calendar', label: 'Google Calendar', description: 'Manage Google Calendar sync.', route: '/admin/integrations/google-calendar' },
  { id: 'stripe', label: 'Stripe', description: 'View the Stripe connection status.', route: '/admin/integrations/stripe' },
] as const;

export const ALLOWED_STAFF_SCOPES: readonly string[] = STAFF_ACCESS_AREAS.map(area => area.id);