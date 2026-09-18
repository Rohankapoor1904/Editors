---
name: ui-design-system
description: >-
  DaVinci Resolve and Premiere Pro-grade UI design system for CineCraft AI.
  Use when designing, styling, or refining UI components, themes, layout splitters,
  color grading wheels, audio VU meters, and timeline track controls.
---

# UI Design System: CineCraft AI (Pro NLE Tier)

This skill governs the aesthetic and interaction standards for CineCraft AI, delivering a studio-grade creative workstation experience.

## 1. Dark Theme Color Palette & Tokens

CineCraft AI uses an ultra-refined dark interface optimized for color grading and prolonged editing sessions:

| Token | Hex / HSL | Semantic Role |
| :--- | :--- | :--- |
| `--surface-base` | `#0b0c10` | Deep background / monitor bezel |
| `--surface-panel` | `#13151b` | Primary panels (Timeline, Bin, Inspector) |
| `--surface-elevated` | `#1a1d26` | Floating modals, toolbars, popovers |
| `--surface-interactive`| `#252936` | Buttons, inputs, unselected track headers |
| `--border-subtle` | `#232733` | Panel borders, subtle grid dividers |
| `--border-focus` | `#4f46e5` | Active focus rings, selected clip outline |
| `--accent-primary` | `#6366f1` | Primary CTA, playhead line, active tool |
| `--accent-hover` | `#4f46e5` | Hover states on primary controls |
| `--clip-video` | `#2563eb` | Video track clip standard color |
| `--clip-audio` | `#059669` | Audio track clip standard color |
| `--clip-title` | `#7c3aed` | Title / caption clip color |
| `--meter-green` | `#10b981` | Audio level -inf to -12 dBFS |
| `--meter-yellow` | `#f59e0b` | Audio level -12 to -3 dBFS |
| `--meter-red` | `#ef4444` | Audio level > -3 dBFS (clip warning) |

## 2. Typography & Numerical Formatting

- **UI Font**: Inter / SF Pro (`font-sans`), weight 400 (regular) for labels, 500 (medium) for headers.
- **Timecode & Numbers**: JetBrains Mono / Roboto Mono (`font-mono`), tabular numbers (`font-variant-numeric: tabular-nums`).
- **Standard Timecode Format**: `HH:MM:SS:FF` (e.g., `01:14:32:18`).
- **Decibel Formatting**: `-18.2 dBFS` with explicit sign.

## 3. Professional NLE Interaction Rules

1. **Keyboard-First Design**:
   - `Space`: Toggle Play/Pause.
   - `J` / `K` / `L`: Shuttle reverse / stop / shuttle forward (with 2x, 4x, 8x acceleration).
   - `C` / `B`: Razor / Blade cut tool.
   - `V`: Selection / Pointer tool.
   - `Ctrl/Cmd + Z`: Undo.
   - `Ctrl/Cmd + Shift + Z`: Redo.
   - `I` / `O`: Mark In / Out points.

2. **Snapping & Magnetic Feedback**:
   - Visual snap indicator (a vertical cyan line `#06b6d4`) must appear when dragging clips within 8px of adjacent cut points or playhead.
   - Micro-haptic audio click or subtle visual snap threshold.

3. **Color Grading Wheels UI**:
   - Circular hue/saturation vectorscope representation.
   - Smooth 2D joystick handle with precise delta scaling on `Shift + Drag`.
   - Dedicated reset buttons on double-click.

4. **Audio VU Meters**:
   - Segmented or gradient peak meter with 300ms peak-hold tick.
   - Integrated LUFS meter alongside RMS bars.
