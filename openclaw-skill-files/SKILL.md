---
name: ui-ux-pro-max
description: "UI/UX design intelligence. Generates complete design systems from keywords. Use when user designs, builds, creates, reviews, fixes, or improves any UI. Covers 67 styles, 96 palettes, 57 font pairings, 25 chart types, 99 UX guidelines, 13 tech stacks. Reference files contain all data — no scripts needed."
user-invocable: true
metadata: {"openclaw": {"emoji": "🎨", "homepage": "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", "os": ["darwin", "linux", "win32"], "always": false, "requires": {"bins": []}}}
---

# UI/UX Pro Max — Design Intelligence

## Overview

Self-contained design intelligence with 67 UI styles, 96 color palettes, 57 font pairings, 25 chart types, 99 UX guidelines, and 13 tech stack guidelines. All data is embedded in companion markdown files — no scripts or databases needed.

## When to Use

- User says "design", "build", "create", "implement", "review", "fix", "improve", "optimize" any UI
- User wants a landing page, dashboard, admin panel, e-commerce site, SaaS app, portfolio, blog, or mobile app
- User asks about color palettes, typography, font pairings, or UI styles
- User mentions specific styles: glassmorphism, minimalism, brutalism, neumorphism, bento grid, dark mode
- User asks about accessibility, hover states, animations, responsive layout, or UX best practices
- User is working with `.html`, `.tsx`, `.vue`, `.svelte`, `.swift`, `.dart`, or `.kt` files

## When NOT to Use

- User is working on backend-only code (APIs, databases, CLI tools) with no UI
- User is asking about DevOps, infrastructure, or deployment
- Task is pure logic/algorithm work with no visual component

## Reference Files

All design data is in these companion files. Read the relevant ones based on the task:

| File | Contents | When to Read |
|------|----------|-------------|
| [styles.md](styles.md) | 67 UI styles with colors, effects, CSS keywords | Choosing a visual style |
| [colors.md](colors.md) | 96 industry-specific color palettes (hex values) | Picking color schemes |
| [typography.md](typography.md) | 57 font pairings with Google Fonts URLs | Choosing fonts |
| [ux-guidelines.md](ux-guidelines.md) | 99 UX rules with do/don't + code examples | Reviewing/building UI |
| [charts.md](charts.md) | 25 chart types with library recommendations | Data visualization |
| [landing.md](landing.md) | 30 landing page patterns with conversion tips | Building landing pages |
| [products.md](products.md) | 96 product-type design recommendations | Matching style to product |
| [icons.md](icons.md) | 100 Lucide icons with import codes | Adding icons |
| [web-interface.md](web-interface.md) | 30 web accessibility and performance rules | Web-specific best practices |
| [react-performance.md](react-performance.md) | 45 React/Next.js performance patterns | React optimization |
| [ui-reasoning.md](ui-reasoning.md) | Design reasoning rules for style selection | Auto-selecting styles |

## Instructions

### Step 1: Analyze User Requirements

Extract from the user's request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, beauty, etc.
- **Stack**: React, Vue, Next.js, Svelte, Flutter, SwiftUI, or default to HTML + Tailwind

### Step 2: Look Up Design Recommendations

1. Read **products.md** — find the matching product type to get recommended styles, landing patterns, and color focus
2. Read **ui-reasoning.md** — find the matching UI category to get reasoning rules, anti-patterns, and severity
3. Read **styles.md** — look up the recommended style(s) for full details (colors, effects, CSS keywords, implementation checklist)
4. Read **colors.md** — find the industry-matching color palette (primary, secondary, CTA, background, text hex values)
5. Read **typography.md** — find a font pairing that matches the mood (get Google Fonts URL and CSS import)

### Step 3: Supplement As Needed

- Building a landing page? Read **landing.md** for section order, CTA placement, and conversion strategy
- Adding charts? Read **charts.md** for the right chart type, colors, and library recommendation
- Need icons? Read **icons.md** for Lucide icon names and import codes
- Reviewing existing code? Read **ux-guidelines.md** for do/don't checklist with code examples
- React/Next.js project? Read **react-performance.md** for performance patterns
- Web accessibility? Read **web-interface.md** for ARIA, focus, and form best practices

### Step 4: Implement the Design

Synthesize the looked-up data and implement. Always apply these mandatory rules:

1. **No emojis as icons** — use SVG icons (Heroicons, Lucide, Simple Icons)
2. **`cursor-pointer`** on all clickable elements
3. **Smooth transitions** (150-300ms) on hover states — never use `transition-all`
4. **4.5:1 minimum contrast** ratio for text
5. **Responsive** at 375px, 768px, 1024px, 1440px
6. **`prefers-reduced-motion`** respected
7. **No content hidden** behind fixed navbars
8. **Visible focus states** — never `outline-none` without replacement
9. **Minimum 44x44px** touch targets on mobile
10. **`font-display: swap`** for web fonts

## Examples

**Input:** "Build me a SaaS dashboard with dark mode"
**Steps:**
1. Read products.md → find "SaaS" → Recommended: Glassmorphism, secondary: Dark Mode
2. Read styles.md → look up "Glassmorphism" and "Dark Mode (OLED)" for effects and colors
3. Read colors.md → find "SaaS" palette → Primary: #6366F1, CTA: #10B981
4. Read typography.md → find "friendly, modern, saas" → Plus Jakarta Sans
5. Read react-performance.md → get Suspense, dynamic import, and SWR patterns
6. Implement with all data combined

**Input:** "Create a landing page for a beauty spa"
**Steps:**
1. Read products.md → find "Beauty/Spa" → Recommended: Soft Elegance
2. Read landing.md → find "Hero + Testimonials" pattern for service businesses
3. Read colors.md → find "beauty" palette → soft pinks, warm neutrals
4. Read typography.md → find "elegant" mood → serif heading + clean body font
5. Read ux-guidelines.md → check animation, accessibility, touch rules
6. Implement with all data combined

**Input:** "Review this component for UX issues"
**Steps:**
1. Read ux-guidelines.md → check all CRITICAL and HIGH severity rules
2. Read web-interface.md → check accessibility, focus, form rules
3. Flag violations with specific do/don't examples from the files
4. Provide code fixes

## Guidelines

- Always look up product type and style before writing UI code
- If no exact product match, use the closest industry match
- Default to HTML + Tailwind when user doesn't specify a stack
- When reviewing code, focus on CRITICAL and HIGH severity rules first
- Use the pre-delivery checklist below before delivering any UI code

## Pre-Delivery Checklist

- [ ] No emojis used as icons (SVG only: Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Text contrast 4.5:1 minimum (light mode: slate-900 text, slate-600 muted)
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Touch targets minimum 44x44px
