/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1114",
        panel: "#16181d",
        border: "#252830",
        muted: "#8b8f98",
        accent: "#E7661F",
        "panel-hover": "#1e2128",
      },
    },
  },
  plugins: [],
};
