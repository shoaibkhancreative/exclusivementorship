/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Surfaces & borders — warm cream scale built from the brand background (#f8efce)
        base: {
          950: "#f8efce", // page background (brand)
          900: "#fdf8e9", // elevated card / panel background
          800: "#f0e3b8", // hover surface, dividers, avatar bg
          700: "#e4d39c", // default border
          600: "#cdb877"  // hover / emphasis border
        },
        // Primary brand accent — warm red (#e63946)
        accent: {
          500: "#e63946", // fills, buttons, icons (brand)
          400: "#ef4f5b", // hover state
          300: "#b71c2c"  // text on light accent-tinted chips
        },
        // Warm neutral text scale tuned for the cream background,
        // anchored on the brand text color (#252525)
        zinc: {
          50: "#1c1b17",
          100: "#252525",
          200: "#3c3a33",
          300: "#585347",
          400: "#726c5d",
          500: "#8c8674",
          600: "#a69f89",
          700: "#c0b89d",
          800: "#dcd3b4",
          900: "#ede4c4"
        },
        // Secondary brand accent — muted bronze/gold for focus states & subtle highlights
        highlight: {
          500: "#b8862e",
          400: "#c99a49"
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"]
      },
      // A couple of named display sizes on top of Tailwind's default scale —
      // fluid-ish via clamp so the hero headline doesn't just jump between
      // two fixed breakpoints, and carries its own tracking/leading so
      // callers don't have to remember the pairing every time.
      fontSize: {
        display: ["clamp(2.25rem, 1.85rem + 1.8vw, 3.25rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }]
      },
    }
  },
  plugins: []
};
