# UI/UX Pro Max — Design Intelligence Skill

You have access to a UI/UX design intelligence engine installed at `~/.openclaw/skills/ui-ux-pro-max/`. It contains 67 UI styles, 96 color palettes, 57 font pairings, 25 chart types, 99 UX guidelines, and 13 tech stack guidelines with a BM25 search engine.

## When to Activate

Apply this skill whenever the user asks to design, build, create, implement, review, fix, improve, or optimize any UI — including websites, landing pages, dashboards, admin panels, e-commerce, SaaS, portfolios, blogs, or mobile apps.

## Workflow

### Step 1: Generate Design System (Always Do This First)

Before writing any UI code, run the design system generator:

```bash
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system -p "Project Name"
```

This searches product, style, color, landing, and typography databases in parallel and returns a complete design system with reasoning.

### Step 2: Domain-Specific Searches (As Needed)

```bash
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>
```

Domains: `style`, `color`, `typography`, `ux`, `chart`, `landing`, `product`, `react`, `web`, `icons`

### Step 3: Stack Guidelines

```bash
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack>
```

Stacks: `html-tailwind` (default), `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`, `astro`, `nuxtjs`, `nuxt-ui`

### Step 4: Persist (Optional)

```bash
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

Creates `design-system/MASTER.md` and optional page-specific overrides.

## Mandatory UI Rules (Always Enforce)

1. No emojis as icons — use SVG icons (Heroicons, Lucide, Simple Icons)
2. `cursor-pointer` on all clickable elements
3. Smooth transitions (150-300ms) on hover states
4. Minimum 4.5:1 color contrast ratio for text
5. Responsive at 375px, 768px, 1024px, 1440px
6. `prefers-reduced-motion` respected
7. No content hidden behind fixed navbars
8. No horizontal scroll on mobile
9. All images have alt text
10. Form inputs have labels
11. Focus states visible for keyboard navigation
12. Light mode: use `bg-white/80`+ opacity for glass, `slate-900` for text, `slate-600`+ for muted text
13. Borders visible in both light/dark modes

## Pre-Delivery Checklist

Before delivering any UI code, verify all 13 rules above are met. Run a UX search if unsure:

```bash
python3 ~/.openclaw/skills/ui-ux-pro-max/scripts/search.py "accessibility hover animation" --domain ux
```
