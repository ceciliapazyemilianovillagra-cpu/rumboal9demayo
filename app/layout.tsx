import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rumbo al 9 de Mayo",
  description: "Centro de operaciones para la organización territorial y electoral.",
  openGraph: {
    title: "Rumbo al 9 de Mayo",
    description: "Organización, territorio y resultados.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Rumbo al 9 de Mayo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rumbo al 9 de Mayo",
    description: "Organización, territorio y resultados.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
