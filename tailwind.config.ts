import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },

      colors: {
        ekvity: {
          blue: "#0F2A50",
          green: "#16A34A",
          grey: "#475569",
          bg: "#F8FAFC",
        },
      },
    },
  },

  plugins: [],
};

export default config;
