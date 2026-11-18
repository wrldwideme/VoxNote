/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src-ui/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Concept A Design Tokens
        brand: {
          primary: "#577A5B",
          "primary-hover": "#49684D",
          "primary-light": "#E9F2E8",
          surface: "#FFFDF8",
          background: "#F7F3EE",
          border: "#E8E1D7",
          "border-strong": "#D5CEBF",
          text: "#1F2A22",
          "text-secondary": "#6B736D",
          muted: "#949C96",
          danger: "#D9534F",
          "danger-light": "#FDECEB",
        },
        // Dark theme tokens
        dark: {
          background: "#141715",
          surface: "#1B211D",
          raised: "#232B25",
          hover: "#2A332C",
          border: "#2C362F",
          "border-strong": "#3C4840",
          text: "#EEF3EF",
          "text-secondary": "#9BA8A0",
          "primary-light": "#1E3023",
        },
      },
      fontFamily: {
        sans: ["Inter", "Manrope", "Segoe UI Variable Text", "Segoe UI", "sans-serif"],
        display: ["Inter", "Manrope", "sans-serif"],
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        6: "24px",
        8: "32px",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(31, 42, 34, 0.05), 0 1px 2px rgba(31, 42, 34, 0.03)",
        card: "0 2px 8px rgba(31, 42, 34, 0.06), 0 1px 2px rgba(31, 42, 34, 0.04)",
        dialog: "0 16px 48px -8px rgba(20, 23, 21, 0.2), 0 4px 16px rgba(20, 23, 21, 0.08)",
      },
    },
  },
  plugins: [],
};
