import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enzi Workshop Platform - Prioritization & DVF Engine",
  description:
    "Specialized workshop facilitation tool to capture user findings, map complex data structures, and prioritize features using DVF framework.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100 selection:text-emerald-900">
        {children}
      </body>
    </html>
  );
}
