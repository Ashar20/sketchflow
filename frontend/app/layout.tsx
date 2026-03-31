import type { Metadata } from "next";
import "./globals.css";
import { ProvidersWrapper } from "@/components/providers-wrapper";

export const metadata: Metadata = {
  title: "Sketch Flow — Draw your futures",
  description: "A trading game where predictions are expressed as drawings, not orders. Sketch your price path and trade your market intuition.",
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="antialiased  bg-[#0a0a0a] font-sans">
        <ProvidersWrapper>
          {children}
        </ProvidersWrapper>
      </body>
    </html>
  );
}
