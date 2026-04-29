## UI & Design System

Strictly adhere to the "Daily Spark" design system for all UI generation. Do not use Claude's default purples/ambers or standard generic gradients.

### 1. Color Palette (The "Growth & Energy" Scheme)
- **Primary (Action/Growth):** #2D6A4F (Deep Forest Green)
- **Secondary (Motivation/Energy):** #FF9F1C (Bright Tiger Orange)
- **Background (Focus):** #F8F9FA (Soft Paper White)
- **Surface (Card/Task):** #FFFFFF (Pure White)
- **Accent (Celebration):** #40916C (Mint Leaf Green)
- **Text (Main/Headlines):** #1B4332 (Dark Evergreen)
- **Text (Subtle/Muted):** #6C757D (Slate Gray)

### 2. Design Guardrails
- **Typography:** Use clean, rounded sans-serif fonts (e.g., 'Inter' or 'Plus Jakarta Sans').
- **Border Radii:** Use soft, modern rounding for all task cards and buttons (`rounded-xl` or `12px`).
- **Shadows:** Only use very soft, diffused shadows to create depth. No harsh borders.
- **Micro-interactions:** Buttons should have a subtle scale effect on hover. Success states for completed tasks should use a "burst" of Mint Leaf Green.
- **Layout Patterns:**
    - Use "Progress Rings" for daily motivation tracking instead of standard bars.
    - Group tasks into clear "Today," "Soon," and "Accomplishments" cards.
    - Space components generously; aim for a "breathable" and calm interface.

### 3. Implementation Rule
- When generating CSS or Tailwind, use these specific hex codes.
- Do NOT use `indigo-600` or `purple-500` under any circumstances.
- If a component needs a gradient, use #2D6A4F to #40916C only.
