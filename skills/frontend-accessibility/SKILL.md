---
name: frontend-accessibility
description: Practical accessibility (WCAG 2.2 AA) for web interfaces — semantic HTML, keyboard support, focus management, labels, contrast, motion and testing with automated tools and screen readers. Use when building or reviewing UI components, forms, dialogs, navigation or any user-facing page.
---

# Frontend accessibility

Accessible interfaces work for keyboard, screen-reader, voice-control, low-vision and cognitive-disability users — and are better for everyone else.

## Semantics first

- Use native elements: `<button>` for actions, `<a href>` for navigation, `<label>` for inputs, `<table>` for tabular data, landmarks (`header`, `nav`, `main`, `footer`).
- One `h1` per page and a logical heading hierarchy.
- ARIA only when no native element fits; a wrong ARIA role is worse than none. Follow the ARIA Authoring Practices patterns for custom widgets (tabs, menus, comboboxes, dialogs).

## Keyboard

- Everything clickable is reachable with Tab and operable with Enter/Space; custom widgets support arrow keys as their pattern expects.
- Visible focus indicator on every interactive element (never `outline: none` without a replacement).
- Logical focus order that follows the visual order; a "skip to content" link on pages with navigation.
- No keyboard traps, except inside an open modal dialog.

## Focus management

- Dialogs: move focus into the dialog when it opens, trap it while open, close with Escape, return focus to the trigger when closed. The native `<dialog>` element with `showModal()` does most of this.
- After route changes in single-page apps, move focus to the new page heading or announce the change.
- After deleting an item, move focus somewhere sensible (next item or the list).

## Forms

- Every input has a visible label tied to it; placeholders are not labels.
- Errors are shown next to the field in text (not colour alone), linked with `aria-describedby`, and summarised or announced on submit.
- Required fields marked in text and with `required`.

## Visual

- Text contrast at least 4.5:1 (3:1 for large text and UI components); check both light and dark themes.
- Do not convey meaning with colour alone.
- Layout works at 200% zoom and 320 px width without horizontal scrolling.
- Respect `prefers-reduced-motion`; no flashing content.
- Touch targets at least 24×24 CSS pixels (44×44 recommended).

## Media and content

Meaningful images have `alt` text; decorative images have `alt=""`. Videos have captions. Links describe their destination ("Download the 2025 report", not "click here"). Set the page `lang`.

## Testing

1. Automated: axe (browser extension, `@axe-core/playwright`, jest-axe) and Lighthouse in CI. Automation catches roughly a third of issues.
2. Keyboard-only pass through every flow.
3. Screen reader spot checks: VoiceOver (macOS/iOS), NVDA (Windows), TalkBack (Android).
4. Zoom to 200% and check reflow.
