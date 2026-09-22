export default {
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // ── Obsidian surfaces ──────────────────────────────────────────────
        // Near-black, very slightly green-shifted so the emerald accent feels
        // like it belongs to the same material instead of sitting on top of it.
        // Numbering keeps its old *role* (page -> card -> tint -> border ->
        // stronger border), so every existing bg-base-XXX / border-base-XXX
        // class still points at the right thing — only the hex values changed.
        base: {
          950: "#0B0F0D", // page background: obsidian, never pure black
          900: "#101715", // card surface: one step above the page
          800: "#16201C", // tinted section / hover surface
          700: "#1E2A24", // hairline border: default 1px card / input border
          600: "#2C3B33" // stronger border: dividers, hover borders, active outlines
        },
        // ── Signature emerald ──────────────────────────────────────────────
        // Bright, liquid green — the "money moving" colour. Every stop clears
        // 4.5:1 against base-950/900, and accent-500 pairs with base-950 text
        // (NOT white) when used as a button fill.
        accent: {
          600: "#0A8F4E", // deepest: gradient dark-stop, pressed states, glows
          500: "#12C46B", // primary emerald: CTA fills, links, prices
          400: "#22D97C", // hover state, gradient light-stop
          300: "#4DF0A0" // brightest mint: small icons, checks, chip text
        },
        // ── Ink scale on dark surfaces ─────────────────────────────────────
        // 50 = brightest / most emphasis, 900 = faintest. Cool desaturated
        // greys with a faint green cast so nothing reads as blue-grey.
        zinc: {
          50: "#F5FFF9", // brightest: display headlines, max emphasis
          100: "#E4EDE8", // primary body text
          200: "#C9D6CF", // secondary text / sub-headings
          300: "#AEBEB5", // tertiary text
          400: "#94A69C", // muted body text
          500: "#7E9188", // captions, meta labels, the .kicker class
          600: "#667A70", // faint text (non-critical, secondary icon default)
          700: "#4F6259", // very faint: placeholders, disabled text
          800: "#374840", // barely-there: decorative only
          900: "#25332C" // near-invisible: dividers drawn with text utilities
        },
        // ── Violet pop ─────────────────────────────────────────────────────
        // Success / progress / "confirmed" states. Deliberately NOT green —
        // the accent already owns green, so a confirmation needs its own hue
        // to stay readable next to a CTA. Pairs with base-950 text when filled.
        highlight: {
          500: "#9B82FF", // primary violet — used as text and as icon/progress
          400: "#B49FFF" // lighter violet for tinted badge foregrounds
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"]
      },
      fontSize: {
        display: ["clamp(2.25rem, 1.85rem + 1.8vw, 3.25rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }]
      },
      keyframes: {
        "gentle-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.045)" }
        },
        "gentle-pop": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        "dot-bounce": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.5" },
          "40%": { transform: "translateY(-6px)", opacity: "1" }
        }
      }
    }
  },
  plugins: []
};
