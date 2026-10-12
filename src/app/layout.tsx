import type { Metadata } from "next";
import "./globals.css";
import "./scene.css";
export const metadata: Metadata = {
  title: "SUMMIN — Know the deck. Play the odds.",
  description:
    "A strategy card game against computer opponents or with 2–5 friends. One target. One shared deck. A few secrets.",
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
