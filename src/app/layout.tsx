import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

// Aleph keynote serif: the Didone-style display face used for the
// exhibition entry and for platform / finding titles across the site.
// Falls back to Georgia when the webfont is unavailable.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Bewize Workshop — Phase DVF",
  description:
    "Experience the digital collaborative platform to help shaping the roadmap. Desirability, Viability & Feasibility (DVF) workshop for Bank BSI, facilitated by Aleph.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100 selection:text-emerald-900`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
