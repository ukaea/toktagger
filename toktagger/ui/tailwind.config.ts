import type { Config } from "tailwindcss";

export default {
  content: [
    // App.jsx/main.jsx sit outside src/; without them the shell's h-screen and
    // overflow-auto are never generated and every page's h-full collapses.
    "./*.{js,jsx,ts,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;
