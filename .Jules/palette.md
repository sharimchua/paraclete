## 2025-02-24 - Missing ARIA Labels on Icon-Only Buttons

**Learning:** Found multiple instances of icon-only buttons (like close modals or delete tags) using generic text like '✕' or '×' without any `aria-label`. These elements are functionally invisible to screen readers, meaning users navigating via screen readers wouldn't know what these buttons do. It's important to remember accessibility basics like this for a better UX.
**Action:** Added descriptive `aria-label` attributes to these icon-only buttons to ensure they announce their actions correctly.
