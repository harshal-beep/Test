# CLAUDE.md — Project Admin Settings

## Skills

### UI/UX Pro Max (Permanent Resource)

**Source:** [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

When doing ANY UI/UX work (designing, building, reviewing, or fixing interfaces), always use the UI/UX Pro Max skill:

1. **Generate a design system first** before writing UI code:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system -p "Project Name"
   ```

2. **Search specific domains** for detailed guidance:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <style|color|typography|ux|chart|landing|product|react|web>
   ```

3. **Get stack-specific guidelines** for implementation:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack <html-tailwind|react|nextjs|vue|svelte|shadcn|flutter|swiftui|react-native|jetpack-compose>
   ```

4. **Persist design systems** for cross-session consistency:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
   ```

Coverage: 67 UI styles, 96 color palettes, 57 font pairings, 25 chart types, 99 UX guidelines, 13 tech stacks.

### Key UI Rules (Always Apply)

- No emojis as icons — use SVG (Heroicons, Lucide, Simple Icons)
- `cursor-pointer` on all clickable elements
- Smooth transitions (150-300ms) on hover states
- Minimum 4.5:1 color contrast ratio
- Responsive at 375px, 768px, 1024px, 1440px
- `prefers-reduced-motion` respected
- No content hidden behind fixed navbars
