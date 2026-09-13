export default {
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#f8efce",
          900: "#fdf8e9",
          800: "#f0e3b8",
          700: "#e4d39c",
          600: "#cdb877"
        },
        accent: {
          500: "#e63946",
          400: "#ef4f5b",
          300: "#b71c2c"
        },
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
        highlight: {
          500: "#b8862e",
          400: "#c99a49"
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
