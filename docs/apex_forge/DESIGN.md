# Design System Strategy: The Command Deck

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Command Deck."** 

Standard Salesforce developer tools often feel cluttered, reminiscent of 1990s spreadsheets. This system rejects that aesthetic in favor of a high-performance, cockpit-inspired experience. We are building a "Digital Curator" for developers—an interface that feels authoritative, silent, and incredibly fast. 

To break the "template" look, we employ **intentional asymmetry**. Primary navigation is pushed to a rigid, ultra-slim sidebar, while the main stage utilizes overlapping layers and varying surface depths. This is not a flat web page; it is a multi-layered tool built for professionals who value data density without the cognitive load of a messy UI.

## 2. Colors & Surface Architecture
The palette is rooted in deep obsidian tones, punctuated by high-performance "Action Blue" and "Success Green."

### The "No-Line" Rule
**Explicit Instruction:** You are prohibited from using 1px solid borders to section off the interface. 
Traditional lines create visual noise that slows down a developer's eye. Instead, boundaries must be defined solely through:
- **Background Color Shifts:** Use `surface-container-low` (#171c23) against a `background` (#0f141b) to define a section.
- **Tonal Transitions:** A subtle shift from `surface-container` (#1b2027) to `surface-container-high` (#252a32) identifies a clickable zone or a header.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of materials. 
- **Base Layer:** `surface` (#0f141b) for the overall application background.
- **Structural Layer:** `surface-container-low` (#171c23) for sidebars and persistent navigation.
- **Content Layer:** `surface-container` (#1b2027) for data tables and code blocks.
- **Floating Layer:** `surface-container-highest` (#30353d) for modals, overlays, or "active" states.

### The "Glass & Gradient" Rule
To inject "soul" into the professional aesthetic:
- **Glassmorphism:** Use semi-transparent `surface-container-high` with a `backdrop-blur` of 12px for floating popovers.
- **Signature Gradients:** Main CTAs should transition from `primary_container` (#0176d3) to `primary` (#a4c9ff) at a 135-degree angle to provide a machined, metallic sheen.

## 3. Typography
The typography is an exercise in "Editorial Utility." We use **Inter** for its mathematical precision.

*   **Display & Headline (The Scale):** Use `headline-sm` (1.5rem) for major module titles. By keeping headlines relatively small and using `on_surface_variant` (#c0c7d4), we maintain a sense of understated power.
*   **Body & Data (The Core):** Most interface work happens in `body-sm` (0.75rem). This high-density approach allows for more code and more data on screen simultaneously.
*   **Labels (The Identity):** `label-sm` (0.6875rem) in all-caps with 0.05em letter-spacing should be used for metadata and status indicators (e.g., "PROD" or "SANDBOX"). This creates an "architectural drawing" feel.

## 4. Elevation & Depth
In this design system, shadows are a last resort, not a default.

*   **Tonal Layering:** Depth is achieved by placing a `surface-container-lowest` (#090f15) card on top of a `surface-container-low` (#171c23) section. This creates a "recessed" look, perfect for code editors.
*   **Ambient Shadows:** For floating elements, use a shadow with a 24px blur, 0% spread, and 6% opacity using the `on_surface` color. This mimics natural light reflecting off a dark surface.
*   **The Ghost Border:** If a boundary is strictly required for accessibility, use the `outline_variant` (#414752) at **15% opacity**. Anything higher is considered a design failure.

## 5. Components

### High-Density Data Tables
*   **Structure:** No vertical or horizontal lines. Use `surface-container-low` for the header row and a subtle `surface-container-lowest` on hover.
*   **Padding:** Use `spacing-2.5` (0.5rem) for row heights to maximize data visibility.

### Buttons
*   **Primary:** A gradient of `primary_container` to `primary` with `on_primary_container` (#fefcff) text. No border.
*   **Secondary:** No background. Use a "Ghost Border" (15% `outline-variant`) and `primary` text.
*   **Rounding:** Strictly `md` (0.375rem) to maintain a technical, engineered appearance.

### Environment Indicators (Prod/Sandbox)
*   **Status Chips:** These are high-contrast beacons. 
    *   **Prod:** `error_container` (#93000a) background with `on_error_container` (#ffdad6) text. Use `label-sm` for the font.
    *   **Sandbox:** `secondary_container` (#026831) background with `on_secondary_container` (#8de4a0) text.

### Custom Component: The "Performance Pulse"
A 2px tall glowing line at the top of an active card or sidebar, using a linear gradient of `secondary` (#83d996) to `secondary_container` (#026831). This signals that the developer's connection to Salesforce is live and high-performing.

## 6. Do's and Don'ts

### Do:
*   **Use breathing room:** Even in high-density layouts, use `spacing-5` (1.1rem) between major logical blocks.
*   **Embrace the dark:** Allow large areas of `surface-dim` to exist; it reduces eye strain and makes the blue/green accents pop.
*   **Respect the grid:** Use the `spacing-px` scale religiously to ensure every element is aligned to a mathematical increment.

### Don't:
*   **Don't use pure black (#000):** It kills the depth. Always use the `surface` tokens.
*   **Don't use standard shadows:** If it looks like a "Material Design" drop shadow, it’s too heavy for this system.
*   **Don't use dividers:** If you feel the need to add a line, try increasing the background contrast between the two sections first.