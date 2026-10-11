import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SUMMIN — Know the deck. Play the odds.",
  description:
    "A multiplayer strategy card game for 2–5 friends. One target. One shared deck. A few secrets.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
