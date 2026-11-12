import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        border: "var(--border)",
        paypal: {
          blue: "#0070BA",
          darkblue: "#003087",
          lightblue: "#00CFDE",
          navy: "#0d1b2a",
        },
        shield: {
          safe: "#10b981", // emerald
          caution: "#f59e0b", // amber
          danger: "#ef4444", // rose/red
          quarantine: "#8b5cf6", // purple
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-sweep": "spin 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
