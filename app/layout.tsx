import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISIN Kategorisierung",
  description: "Kategorisiere ISINs über Finnhub API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="bg-gray-50 dark:bg-gray-900">{children}</body>
    </html>
  );
}
