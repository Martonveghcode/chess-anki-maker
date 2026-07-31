import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Anki Maker",
  description: "Build chess diagrams, move sequences, GIFs, and Anki cards.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
