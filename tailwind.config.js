/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0a0a0b",
          900: "#111113",
          800: "#1a1a1d",
          700: "#26262a",
          600: "#38383e"
        },
        accent: {
          500: "#c9a24b",
          400: "#d8b968",
          300: "#e6cf94"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Söhne'", "Inter", "ui-sans-serif", "sans-serif"]
      }
    }
  },
  plugins: []
};
