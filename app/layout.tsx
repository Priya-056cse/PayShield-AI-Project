import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayShield AI - Your Personal PayPal Scam Defense Agent",
  description:
    "Autonomous scam defense agent for PayPal. Evaluates invoices, payment requests, and communication memos, assigns AI risk scores, and quarantines dangerous items.",
  keywords: [
    "PayPal scam defense",
    "invoice fraud prevention",
    "AI scam detector",
    "PayPal security agent",
    "quarantine scam invoices",
    "GeekSquad scam protection",
  ],
  authors: [{ name: "PayShield AI Team" }],
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="font-sans antialiased bg-zinc-950 text-zinc-100 min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
