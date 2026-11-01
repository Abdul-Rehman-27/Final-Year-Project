/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          tint: "#DDEFEA",
          200: "#99F6E4",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
        },
        surface: "#F4F8F7",
        ink: { DEFAULT: "#0F2A27", muted: "#55706C" },
        line: "#D7E3E0",
      },
      fontFamily: { sans: ["Lato", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
