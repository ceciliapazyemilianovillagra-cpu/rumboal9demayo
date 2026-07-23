import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://rumboal9demayo.vercel.app"),
  title: "Rumbo al 9 de Mayo",
  description: "Centro de operaciones para la organización territorial y electoral.",
  applicationName: "Rumbo al 9 de Mayo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rumbo al 9",
  },
  icons: {
    icon: [{ url: "/rumbo-logo.png", type: "image/png" }],
    shortcut: [{ url: "/rumbo-logo.png", type: "image/png" }],
    apple: [{ url: "/rumbo-logo.png", type: "image/png" }],
  },
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#2d2d49",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
