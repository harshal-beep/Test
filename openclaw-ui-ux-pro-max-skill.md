---
name: ui-ux-pro-max
description: "UI/UX design intelligence with searchable database. Generates complete design systems (styles, colors, typography, layout) from keywords. Use when user designs, builds, creates, reviews, fixes, or improves any UI — websites, dashboards, landing pages, mobile apps, e-commerce, SaaS. Covers 67 styles, 96 palettes, 57 font pairings, 25 chart types, 99 UX guidelines, 13 tech stacks."
user-invocable: true
metadata: {"openclaw": {"emoji": "🎨", "homepage": "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", "os": ["darwin", "linux", "win32"], "always": false, "requires": {"bins": ["python3"]}, "install": [{"id": "python3-brew", "kind": "brew", "formula": "python3", "bins": ["python3"], "label": "Install Python 3 via Homebrew"}]}}
---

# UI/UX Pro Max — Design Intelligence

## Overview

Searchable design intelligence engine with 67 UI styles, 96 color palettes, 57 font pairings, 25 chart types, 99 UX guidelines, and 13 tech stack guidelines. Uses BM25 ranking to generate complete, opinionated design systems from natural language queries.

## When to Use

- User says "design", "build", "create", "implement", "review", "fix", "improve", "optimize" any UI
- User wants a landing page, dashboard, admin panel, e-commerce site, SaaS app, portfolio, blog, or mobile app
- User asks about color palettes, typography, font pairings, or UI styles
- User mentions specific styles: glassmorphism, minimalism, brutalism, neumorphism, bento grid, dark mode
- User asks about accessibility, hover states, animations, responsive layout, or UX best practices
- User is working with `.html`, `.tsx`, `.vue`, `.svelte`, `.swift`, `.dart`, or `.kt` files
- User asks for chart/data visualization recommendations

## When NOT to Use

- User is working on backend-only code (APIs, databases, CLI tools) with no UI
- User is asking about DevOps, infrastructure, or deployment
- User explicitly says they don't want design guidance
- Task is pure logic/algorithm work with no visual component

## Instructions

### Step 1: Analyze User Requirements

Extract from the user's request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, beauty, etc.
- **Stack**: React, Vue, Next.js, Svelte, Flutter, SwiftUI, or default to `html-tailwind`

### Step 2: Generate Design System (Always Do This First)

Run the design system generator to get comprehensive recommendations:

```bash
python3 {baseDir}/scripts/search.py "<product_type> <industry> <keywords>" --design-system -p "Project Name"
```

This searches 5 domains in parallel (product, style, color, landing, typography), applies reasoning rules, and returns: pattern, style, colors, typography, effects, and anti-patterns.

### Step 3: Supplement with Domain Searches (As Needed)

```bash
# More style options
python3 {baseDir}/scripts/search.py "<query>" --domain style

# Color palettes by industry
python3 {baseDir}/scripts/search.py "<query>" --domain color

# Font pairings
python3 {baseDir}/scripts/search.py "<query>" --domain typography

# UX best practices
python3 {baseDir}/scripts/search.py "<query>" --domain ux

# Chart types and libraries
python3 {baseDir}/scripts/search.py "<query>" --domain chart

# Landing page structure
python3 {baseDir}/scripts/search.py "<query>" --domain landing

# React/Next.js performance
python3 {baseDir}/scripts/search.py "<query>" --domain react

# Web accessibility guidelines
python3 {baseDir}/scripts/search.py "<query>" --domain web
```

### Step 4: Get Stack-Specific Guidelines

```bash
python3 {baseDir}/scripts/search.py "<query>" --stack <stack-name>
```

Available stacks: `html-tailwind` (default), `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`, `astro`, `nuxtjs`, `nuxt-ui`

### Step 5: Persist Design System (Optional)

Save for cross-session consistency:

```bash
# Save master design system
python3 {baseDir}/scripts/search.py "<query>" --design-system --persist -p "Project Name"

# Save with page-specific overrides
python3 {baseDir}/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

Creates `design-system/MASTER.md` and optional `design-system/pages/<page>.md` overrides.

### Step 6: Implement the Design

Synthesize the design system output and implement. Always apply these rules:

1. **No emojis as icons** — use SVG icons (Heroicons, Lucide, Simple Icons)
2. **`cursor-pointer`** on all clickable elements
3. **Smooth transitions** (150-300ms) on hover states
4. **4.5:1 minimum contrast** ratio for text
5. **Responsive** at 375px, 768px, 1024px, 1440px
6. **`prefers-reduced-motion`** respected
7. **No content hidden** behind fixed navbars

## Examples

**Input:** "Build me a SaaS dashboard with dark mode"
**Action:**
```bash
python3 {baseDir}/scripts/search.py "SaaS dashboard dark mode" --design-system -p "SaaS Dashboard"
python3 {baseDir}/scripts/search.py "dashboard data" --stack react
```
**Output:** Complete design system with dark palette, dashboard layout pattern, recommended chart types, React-specific guidelines.

**Input:** "Create a landing page for a beauty spa"
**Action:**
```bash
python3 {baseDir}/scripts/search.py "beauty spa wellness service elegant" --design-system -p "Serenity Spa"
python3 {baseDir}/scripts/search.py "hero social-proof" --domain landing
python3 {baseDir}/scripts/search.py "layout responsive form" --stack html-tailwind
```
**Output:** Elegant style with soft colors, hero-centric landing pattern, Google Fonts pairing, Tailwind implementation guidelines.

**Input:** "Review this component for UX issues"
**Action:**
```bash
python3 {baseDir}/scripts/search.py "animation accessibility hover" --domain ux
python3 {baseDir}/scripts/search.py "focus keyboard aria" --domain web
```
**Output:** UX checklist with do/don't examples, accessibility violations flagged with code fixes.

## Guidelines

- Always run `--design-system` before writing any UI code — it provides the foundation
- If the first search doesn't match well, try different keywords (e.g., "healthcare SaaS dashboard" not just "app")
- Default to `html-tailwind` stack when user doesn't specify
- For persistent projects, use `--persist` to save the design system for future sessions
- When reviewing existing code, focus on the Pre-Delivery Checklist items
- Search multiple domains to get a complete picture (style + typography + color = full system)

## Additional Resources

- For the full quick reference guide, see [quick-reference.md](references/quick-reference.md)
- Source repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
