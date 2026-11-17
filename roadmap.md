# Staff access
- [x] Verify Alberto's Scratch subscription and correct promotional subscription access for all students; live Stripe trial confirmed, real sign-in restored Scratch, videos and Pro Zone accessible, server AI entitlement true, three regression tests passed. AI/report full interactions not exercised.
- [x] Limit staff access choices and navigation to Calendar, Pro Zone, Plans & Billing, Lessons & Pricing, Google Calendar, and Stripe.
- [x] Align server permissions and existing grants without changing coach/admin access.
- [x] Verify permission rules and staff controls (seven permission tests pass; authenticated editor displays all six areas).

# Revenue projection
- [x] Let the projection chart horizon be adjusted: next month, next 3 months, next 6 months, next year.
- [x] Link each student in the Prices tab pop-up to their profile, and limit the per-class price menu to $1,000–$2,000 in $50 steps.

# Customer plans PDF
- [x] Add a separate admin-only download with plan prices and benefits, in Apex's modern glass style; verified authenticated download and rendered PDF prices and layout.
- [x] Refresh the customer PDF with neutral dark glass and compact columns; verify the actual download and both pages, preserving current public prices and benefits.
- [x] Limit the customer PDF to subscription plans with individual color themes and Pro lesson percentage discounts; two calculation tests pass, actual authenticated download verified as one page with four membership themes and no lesson currency amounts.
- [x] Show the money saved by subscribing to Pro on its PDF card, reusing the plans-page value range; tests cover the savings math and the real download shows the gold savings line.

# Pro Zone appearance
- [x] Compact the heading, refresh glass tool cards, and display library categories side by side with existing media previews and category-icon fallback.
- [x] Verify student navigation and mobile/desktop layout without changing access or content.

# Coach redemption inbox
- [x] Add coach menu entry and read-only SC Points redemption list with student, reward, points, date and fulfillment status.
- [x] Add assigned-student read policy and filtering tests; verify owner inbox with eight existing redemptions, pending filter and menu navigation. Direct database impersonation test unavailable because the query connection cannot switch roles.

# Scores and handicap
- [x] Unify Scores with existing handicap history and goal, modern glass presentation, and dashboard handicap navigation.
- [x] Verify real student data (28.6 current, 20 goal, four history points), score dialogs and mobile/desktop layout without changing scoring or permissions; build OK.
- [x] Add a separate unofficial round-derived estimate and chronological change without overwriting entered handicap; four tests pass, real-data estimate 29.5/change +0.1 verified, shared rounds cache refreshes after saves.
