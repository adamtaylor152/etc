import type { Metadata, Viewport } from "next";
import { Inter, Rubik } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "etc. CRM", template: "%s · etc. CRM" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#14213d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${inter.variable} ${rubik.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
