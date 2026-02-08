import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NFL Coaching Tree",
  description:
    "Mapping the mentorship lineage of every current NFL head coach",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased bg-[#0a0e17] text-[#e2e8f0] overflow-hidden h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
