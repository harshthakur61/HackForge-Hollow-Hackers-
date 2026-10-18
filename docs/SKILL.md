---
name: fintech-frontend
description: Build polished, trustworthy, responsive frontend experiences for professional fintech products, including investment platforms, digital banking, payments, treasury tools, and financial dashboards.
---

# Fintech Frontend Engineering Skill

## Purpose

Build a refined, trustworthy, production-minded fintech interface. Prioritize clarity, financial-data legibility, predictable interactions, accessibility, responsive behavior, and visual consistency. The result should feel like a credible financial product—not a generic SaaS template or a flashy crypto landing page.

## 1. Start by understanding the product

Before implementation, inspect the existing repository and identify:
- Framework, router, package manager, styling system, component library, and charting library.
- Existing design tokens, shared components, page structure, API contracts, and authentication flow.
- Target users, primary tasks, key financial metrics, and critical user journeys.
- Which data is real, mocked, loading, stale, unavailable, or errored.

Preserve the current architecture and conventions. Do not replace the stack or rewrite working modules without a clear reason. If essential product context is missing, ask one concise question; otherwise make sensible, documented assumptions.

## 2. Visual direction

Aim for a premium, restrained financial-product aesthetic:
- Strong information hierarchy and generous but purposeful spacing.
- Neutral surfaces, crisp borders, subtle elevation, and restrained accent colors.
- A consistent grid and aligned edges; avoid arbitrary card sizes and spacing.
- Clear typography with tabular numerals for monetary values and metrics.
- Use color to communicate meaning, not as decoration.
- Prefer purposeful charts, compact tables, and informative empty states over decorative illustrations.
- Use gradients sparingly. Avoid excessive glassmorphism, neon effects, giant rounded cards, noisy backgrounds, and gratuitous animation.
- Do not copy another product pixel-for-pixel; use references for general quality and interaction patterns only.

If the product has an existing brand system, follow it. Otherwise establish a small design system before building pages.

### Suggested starting tokens

Treat these as defaults, not mandatory values; adapt them to the existing brand.

- Background: very light neutral or deep charcoal depending on the chosen theme.
- Surface: clearly distinguishable from the page background.
- Text: high-contrast primary text and readable secondary text.
- Borders: subtle, consistent, and visible in both themes.
- Accent: one primary brand color, used consistently for main actions and selected states.
- Positive: green; negative: red; warning: amber; neutral/informational: blue or gray.
- Spacing: use a consistent 4px or 8px-based scale.
- Radius: choose a small, consistent set (for example, 8px, 12px, and 16px).
- Motion: short, subtle transitions; respect reduced-motion preferences.

Define tokens as CSS variables or the project's equivalent. Do not scatter arbitrary hex colors, spacing values, and shadows across components.

## 3. Layout and responsive behavior

Design mobile-first, then enhance for larger screens.

- Use a consistent content width, responsive grid, and clear page gutters.
- Desktop dashboards may use a persistent sidebar, compact top navigation, and a primary content area.
- On mobile, collapse navigation into a usable drawer or bottom navigation where appropriate.
- Make data tables usable on small screens: prioritize columns, allow deliberate horizontal scrolling, or switch to stacked rows.
- Prevent clipped dialogs, overflowing charts, broken long numbers, and horizontal page scrolling.
- Keep primary actions visible and reachable on touch devices.
- Use responsive typography and spacing rather than hard-coded viewport assumptions.
- Test at narrow mobile, tablet, laptop, and wide desktop widths.

## 4. Financial dashboard patterns

When appropriate, build reusable components for:
- Account or portfolio balance with clear currency and visibility controls.
- Period-over-period performance with an explicit date range and comparison basis.
- Income, expenses, cash flow, allocation, returns, fees, and transaction activity.
- Searchable, sortable, filterable transaction tables.
- Date-range selectors, account selectors, category filters, and pagination.
- Asset or account allocation charts with labels and accessible legends.
- Recent activity, alerts, pending actions, and account status.
- Download/export actions and transaction detail views.
- Empty, loading, stale-data, partial-data, and error states.

Do not invent metrics, balances, returns, customer testimonials, regulatory claims, partner logos, or performance guarantees. If demo data is needed, label it clearly as sample/demo data and keep it internally consistent.

## 5. Financial data presentation

Financial data must be unambiguous and easy to scan.

- Always show the currency or unit where needed; use locale-aware formatting.
- Use consistent decimal precision and date/time formatting.
- Distinguish absolute change from percentage change.
- State the selected time period and comparison baseline for performance figures.
- Do not imply that past performance guarantees future results.
- Never rely on color alone to indicate gain/loss or status; include signs, labels, or icons.
- Use tabular numerals where available and align numeric columns consistently.
- Explain unfamiliar metrics with concise tooltips or supporting labels.
- For charts, label axes, units, periods, and legends; ensure tooltips are readable and keyboard-accessible where supported.
- Avoid misleading axes, truncated scales that exaggerate changes, or unclear aggregation.
- Show timestamps or “last updated” labels when data freshness matters.
- Clearly distinguish estimated, pending, settled, available, and total balances when relevant.

## 6. Forms and high-impact actions

For money-related workflows—transfers, withdrawals, deposits, investments, payments, and account changes—make every step explicit.

- Label every field; use helpful examples and inline validation.
- Validate inputs without destroying user-entered data.
- Show fees, limits, estimated arrival times, currency, and relevant consequences before confirmation when applicable.
- Use a review/confirmation step for consequential transactions.
- Prevent accidental double submission and show pending, success, and failure states.
- Do not claim a transaction succeeded unless the backend confirms success.
- Preserve idempotency and authorization responsibilities in the backend; frontend controls are not security boundaries.
- Provide clear recovery paths for failed or interrupted actions.
- Avoid dark patterns, fake urgency, preselected risky choices, and confusing opt-outs.

## 7. Interaction quality

Every visible control must have a meaningful behavior.

- Buttons, links, tabs, menus, filters, search, sort, pagination, dialogs, and toggles must work.
- Use links for navigation and buttons for actions.
- Show focus, hover, active, disabled, loading, success, and error states.
- Provide confirmation before destructive or high-impact actions.
- Use skeletons only when they improve perceived loading; avoid flashing layout shifts.
- Use optimistic updates only when safe and provide rollback/error handling.
- Avoid fake buttons, dead links, placeholder charts presented as live data, and interactions that only change appearance.
- Add subtle transitions only where they help communicate state.
- Respect `prefers-reduced-motion`.

## 8. Accessibility

Target WCAG 2.2 AA where practical.

- Use semantic HTML and a logical heading hierarchy.
- Ensure full keyboard navigation and visible focus indicators.
- Associate form fields with labels and error messages.
- Maintain sufficient text and UI contrast.
- Add accessible names to icon-only controls.
- Do not convey status by color alone.
- Support screen readers for charts and complex tables through summaries, labels, and accessible data alternatives.
- Manage focus correctly in dialogs and menus.
- Ensure touch targets are comfortably usable.
- Test zoom and text resizing without loss of functionality.

## 9. Security and trust

Frontend presentation must not substitute for real security.

- Never place API secrets, private keys, credentials, or privileged tokens in client code.
- Do not expose sensitive account data in URLs, console logs, analytics events, or error messages.
- Treat all client input and API responses as untrusted.
- Avoid rendering untrusted HTML; use the framework's safe rendering patterns.
- Do not store sensitive financial information in local storage unless the architecture and threat model explicitly justify it.
- Use backend authorization for every protected action; hiding a button is not authorization.
- Avoid logging full account numbers or sensitive transaction details.
- Mask sensitive identifiers by default and reveal them only through an intentional, accessible control.
- Use honest security, encryption, insurance, compliance, and regulatory copy only when verified by the product owner.

## 10. Engineering standards

- Reuse existing dependencies and conventions before adding new libraries.
- Build small, composable components with clear responsibilities.
- Keep formatting, business rules, data fetching, and presentation appropriately separated.
- Use the project's existing type system; avoid `any` or equivalent escape hatches unless justified.
- Handle loading, error, empty, stale, and success states for every data-dependent view.
- Keep secrets and server-only logic out of frontend bundles.
- Avoid unnecessary dependencies, duplicated components, giant page files, and premature abstractions.
- Use realistic fixtures for prototypes, clearly separated from production API integration.
- Never silently replace a real API with mock data.
- Keep components resilient to long names, large values, missing fields, and slow networks.

## 11. Charts and visualization

- Choose the simplest chart that answers the user’s question.
- Use line charts for time-series trends, bars for comparisons, and donut charts only for a small number of meaningful parts of a whole.
- Keep legends and labels concise; avoid 3D charts and decorative visualizations.
- Provide tooltips and a text/data-table alternative for important information.
- Handle no-data and insufficient-data cases gracefully.
- Use consistent scales when comparing related charts.
- Ensure colors remain distinguishable in light and dark themes and for common color-vision deficiencies.

## 12. Page-specific guidance

### Marketing / landing pages
Lead with a clear value proposition, audience, primary action, and credible product evidence. Explain the workflow and pricing/fees transparently. Avoid unsupported claims such as “guaranteed returns” or “zero risk.”

### Auth and onboarding
Keep the flow calm and focused. Explain why information is needed, provide clear validation, and never imply that a frontend-only demo login is production-secure.

### Overview dashboard
Surface the most important balances and actions first. Use hierarchy, not a wall of equal-sized cards. Include date ranges, freshness, and drill-down paths.

### Transactions
Support useful filtering, clear status labels, legible amounts, pagination, and accessible transaction details. Make pending and settled states distinct.

### Investment / portfolio
Clearly distinguish market value, cost basis, realized and unrealized returns, fees, and selected time periods where applicable. Avoid performance promises.

### Payments / transfers
Make source, destination, amount, currency, fees, and timing clear before final confirmation. Use an explicit final state after backend response.

### Settings / profile
Group related preferences, provide clear save/cancel behavior, and confirm security-sensitive changes.

## 13. Workflow for implementation

1. Inspect the repository and identify the app's actual stack and conventions.
2. Map the key user journey and page states before coding.
3. Establish or reuse design tokens, typography, layout primitives, and component patterns.
4. Implement the highest-value page and shared components first.
5. Connect real APIs where available; otherwise use clearly labeled demo fixtures.
6. Implement loading, empty, error, success, and responsive states.
7. Verify navigation and every visible control.
8. Run the available lint, type-check, test, and build commands.
9. Fix errors introduced by the changes and inspect the browser/app at multiple viewport sizes.
10. Summarize what changed, what was verified, and any remaining limitations.

Do not claim tests passed unless they were actually run.

## 14. Definition of done

Before considering the frontend complete, verify:

- [ ] The interface matches a coherent, intentional fintech design system.
- [ ] Core user journeys work from start to finish.
- [ ] Every visible interactive element has a meaningful action.
- [ ] Monetary values, units, dates, statuses, and data freshness are clear.
- [ ] Loading, empty, error, and success states are covered.
- [ ] Mobile and desktop layouts are usable without accidental overflow.
- [ ] Keyboard navigation, focus states, labels, and contrast are addressed.
- [ ] No secrets or sensitive financial data are exposed in client code or logs.
- [ ] No unsupported financial, security, or compliance claims are present.
- [ ] Lint, type-check, tests, and production build have been run when available.
- [ ] Any mock data or unimplemented backend behavior is disclosed clearly.

## Final instruction

Make the interface feel dependable, precise, calm, and premium. Prioritize trust, usability, data clarity, and functional completeness over visual effects. Follow the repository's existing stack, never fabricate financial facts, and be explicit about any prototype-only behavior.
