import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

// Tipografía de la identidad "Cabina" (estudio-ui.html): Bricolage Grotesque
// para títulos y cifras grandes, Instrument Sans para interfaz, DM Mono para
// todo valor medido. Reemplaza a Geist - ninguna pantalla debe quedar con la
// fuente por defecto de Next.js (FASE 10B).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-value",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Personal AI DAW",
  description: "Personal vocal-focused DAW with AI-assisted mixing and mastering.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI DAW",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${instrumentSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="h-full min-h-full flex flex-col bg-neutral-950">{children}</body>
    </html>
  );
}
