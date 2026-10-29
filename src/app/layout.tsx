import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: { default: "FleaMaMa", template: "%s · FleaMaMa" },
  description: "Gestion des emplacements de la brocante",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`h-full antialiased ${inter.variable} ${bricolage.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
