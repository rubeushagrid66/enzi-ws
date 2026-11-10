import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Helvetica Neue is the standard app typeface (all pages
        // except the homepage). System stack: Helvetica Neue on
        // Apple devices, Helvetica/Arial elsewhere — no webfont
        // download, so it renders instantly and crisply.
        sans: ["\"Helvetica Neue\"", "Helvetica", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
        // Poppins stays for the homepage only (see layout.tsx and
        // the font-poppins class on the homepage root).
        poppins: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ── BSI brand palette ──────────────────────────────────
        // Primary teal #00A39D and secondary gold #F8AD3C are taken
        // from the official BSI logo (bankbsi.co.id). The tertiary
        // is the deep teal #003D36 (dark surfaces, headings, depth).
        // Text on white uses the darker steps (600/700) so it stays
        // readable — the bright 500 is for fills, borders and large
        // display elements, not small body text.
        bsi: {
          50: "#e6f7f5",
          100: "#c8efec",
          200: "#99dfdb",
          300: "#5ccbc5",
          400: "#1fb3ac",
          500: "#00a39d",
          600: "#00857f",
          700: "#00695c",
          800: "#00544a",
          900: "#003d36",
          950: "#002b26",
        },
        gold: {
          50: "#fef6e7",
          100: "#fdeecb",
          200: "#fbe3a1",
          300: "#f9d170",
          400: "#f8ad3c",
          500: "#e89b1f",
          600: "#c77f0a",
          700: "#9a6208",
          800: "#6e4505",
          900: "#4a2f03",
          950: "#332006",
        },
        deep: {
          50: "#e8f1f0",
          100: "#d1e3e1",
          200: "#a3c7c3",
          300: "#75aba5",
          400: "#478f87",
          500: "#197369",
          600: "#005e57",
          700: "#004d46",
          800: "#003d36",
          900: "#002b26",
          950: "#001f1b",
        },
        enzi: {
          50: "#e6f7f5",
          100: "#c8efec",
          500: "#00a39d",
          600: "#00857f",
          700: "#00695c",
          900: "#003d36",
        },
      },
    },
  },
  plugins: [],
};
export default config;
