import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

const fontHeading = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const fontSans = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clip Engine",
  description: "Homelab Web UI for Clip Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${fontHeading.variable} ${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
