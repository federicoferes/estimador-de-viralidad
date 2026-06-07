import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Estimador de Viralidad — Powered by TribeV2",
  description: "Predecí el potencial viral de tu video usando IA neurocientífica. Basado en TribeV2, el modelo fundacional de visión, audición y lenguaje.",
  openGraph: {
    title: "Estimador de Viralidad",
    description: "IA que predice viralidad analizando activación cerebral con TribeV2",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
