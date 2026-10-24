import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FleaMaMa", template: "%s · FleaMaMa" },
  description: "Gestion des emplacements de la brocante",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
