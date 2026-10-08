---
name: Mentis
description: Light surfaces, clear evidence, and painted landscapes.
colors:
  background: "#f7f7f3"
  foreground: "#242721"
  surface: "#fcfcf9"
  secondary: "#eaece5"
  muted: "#60655c"
  border: "#daddd3"
  green: "#2c6247"
  green-soft: "#e8f0e6"
  red: "#963f34"
  red-soft: "#f8e9e2"
  amber: "#815c21"
typography:
  display:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "clamp(30px, 3.1vw, 39px)"
    fontWeight: 520
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "36px"
    fontWeight: 510
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "26px"
    fontWeight: 520
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "15px"
    lineHeight: 1.65
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 550
  code:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "10px"
    lineHeight: 1.95
rounded:
  status: "4px"
  scene: "5px"
  product: "9px"
  window: "12px"
  action: "99px"
spacing:
  compact: "10px"
  inset: "16px"
  panel: "20px"
  action: "22px"
  content: "24px"
  navigation: "30px"
  scene: "36px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0 22px"
    height: "45px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #242721 90%, transparent)"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0 22px"
    height: "45px"
  button-secondary-hover:
    backgroundColor: "color-mix(in oklab, #eaece5 80%, transparent)"
  button-ghost:
    textColor: "{colors.muted}"
    height: "28px"
    width: "28px"
  status-passed:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.status}"
    padding: "2px 6px"
  status-failed:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    rounded: "{rounded.status}"
    padding: "2px 6px"
  product-window:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.window}"
  tab-active:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.status}"
    height: "28px"
---

# Design System: Mentis

## Overview

**Creative North Star: "Evidence in a Painted Landscape"**

A light field holds compact text, rounded actions, and large painted scenes. Graphite text carries the main hierarchy. Green marks links, focus, and passed checks.

Quiet product windows sit over mineral green and amber paintings. The window content stays readable. Manrope sets interface text. JetBrains Mono identifies code and tool names.

The user selected Cursor as the visual reference. This system records the built Mentis page. The source is `apps/landing/app/globals.css` and its page components.

**Key Characteristics:**

- Light neutral surfaces and graphite text.
- Compact headings and generous section space.
- Painted scenes behind readable product windows.
- Small status labels with explicit text.

## Colors

The palette uses warm light neutrals with forest green status and links.

### Primary

- **Graphite:** Main text and filled actions (`foreground`).
- **Forest Green:** Links, focus outlines, and passed checks (`green`).

### Secondary

- **Clay Red:** Failed checks and copy errors (`red`). Soft red sits behind failed labels (`red-soft`).
- **Amber:** Unverified checks and outdated conclusions (`amber`).

### Neutral

- **Warm Field:** Page background (`background`).
- **Light Surface:** Product windows and setup panels (`surface`).
- **Soft Sage:** Secondary actions and selected tabs (`secondary`).
- **Stone Text:** Supporting text (`muted`).
- **Quiet Border:** Window divisions and rows (`border`).
- **Soft Green:** Passed-label background (`green-soft`).

### Named Rules

**The Status Rule.** Use green for passed checks, red for failed checks, and amber for unverified or outdated states. Keep a text label with each state.

## Typography

**Display Font:** Manrope Variable, with sans-serif fallback.

**Body Font:** Manrope Variable, with sans-serif fallback.

**Label/Mono Font:** JetBrains Mono Variable, with monospace fallback, for code.

Headings use moderate weight and close letter spacing. They stay compact beside the large demonstrations. Body text uses open line spacing.

### Hierarchy

- **Display:** Opening heading. At widths of 800px or less, it uses 35px.
- **Headline:** Setup and closing headings. Section introductions use 30px with 1.35 line height.
- **Title:** Feature headings. At widths of 1150px or less, they use 23px; at 800px or less, they use 25px.
- **Body:** Main page text. Feature text uses 14px with 1.8 line height and a 46ch limit.
- **Label:** Rounded actions. Product fields use 10–12px; product titles use 14–17px.
- **Code:** Copy blocks. Tool names use 10–11px. Code has no font ligatures.

### Named Rules

**The Code Rule.** Use JetBrains Mono for code and tool names. Use Manrope for headings, text, and controls.

## Layout

The main container has a 1300px limit and 48px side space. Side space reduces to 32px at 1150px and 20px at 800px. The header is 78px high, then 70px on phones.

Feature rows pair text with a larger visual. The desktop ratio is 0.88 to 2, with a 62px gap. Rows can reverse. At 800px or less, text and visual stack in reading order. Setup also changes from two columns to one.

```text
Desktop: [Text] [Large visual]
Phone:   [Text]
         [Large visual]
```

The main demo has three columns. At 1150px, the evidence column is hidden. At 800px, the sidebar is hidden. The tabbed content remains.

```text
>1150px: [Sidebar] [Tabbed content] [Evidence]
<=1150:  [Sidebar] [Tabbed content]
<=800:             [Tabbed content]
```

Phone Record scenes keep a 300px painting area. The product panel starts after 275px of top padding. The scene height follows its content. At 440px or less, action padding and text size reduce so both opening actions fit.

## Elevation & Depth

Tonal surfaces and thin borders separate interface regions. Soft shadows lift product windows over paintings. Actions and demo tabs have no shadow.

### Shadow Vocabulary

- **Window:** `0 16px 56px rgb(24 37 27 / 20%)`.
- **Product Surface:** `0 10px 32px rgb(22 41 26 / 17%)`.

### Named Rules

**The Window Rule.** Use soft shadows on product windows. Keep page actions and tabs flat.

## Shapes

Actions have fully rounded ends. Product windows have soft corners. Scenes and inset records have smaller corners. Status labels use compact rectangular forms. Borders divide content without heavy frames. Icons use inline SVG strokes.

## Components

### Buttons

Filled graphite actions use light text. Secondary actions use soft sage and graphite. Their shared height is 45px. Header actions use a smaller size. Hover reduces fill opacity. Focus has a green outline and the button's green ring. Disabled controls reduce opacity.

### Chips

Check labels combine a text state with a colored background. Passed and failed states use their soft fills. Unverified labels use amber text on a pale warm fill. These are status labels, not filters.

### Cards / Containers

Product windows have opaque light surfaces, quiet title bars, and thin row divisions. Keep their text readable over paintings. Smaller panels use the Product Surface shadow. Setup uses a flat light panel with inset content.

### Navigation

Desktop links use compact text and turn green on hover. At 800px or less, a menu button opens a side sheet. Phone links use larger text. Keep the primary setup action visible in the header.

### Demonstration Tabs

Active tabs use a soft sage fill and graphite text. Inactive tabs use muted text. Content enters with a 280ms settle animation. The animation changes opacity, blur, and vertical position. The demo has a pause control. Reduced-motion mode removes animations and transitions.

### Setup Copy Blocks

Code sits on a light inset surface. A header holds the label and copy action. Long code scrolls horizontally. Copy errors use red text.

## Do's and Don'ts

### Do:

- **Do** keep product text on an opaque light surface.
- **Do** use explicit text with check colors.
- **Do** retain visible keyboard focus and reduced-motion support.
- **Do** keep paintings visible when the layout stacks.

### Don't:

- **Don't** add small headings above the main headings.
- **Don't** use hard offset shadows or text glyphs as icons.
- **Don't** replace the supplied font families with system display fonts.
- **Don't** make search relevance use the passed-check treatment.
