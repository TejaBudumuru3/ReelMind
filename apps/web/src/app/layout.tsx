import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReelMind | AI Video Analytics",
  description: "Compare social media videos with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
