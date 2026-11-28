import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Rubik } from "next/font/google";
import "./globals.css";

// Rubik is the brand face (wordmark, headings); IBM Plex Sans carries body text and figures. See globals.css.
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "etc. CRM", template: "%s · etc. CRM" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0e1830", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${plex.variable} ${rubik.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow-lg">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
