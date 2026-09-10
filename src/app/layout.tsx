import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Never statically prerender the shell — auth + public env differ per deploy.
export const dynamic = "force-dynamic";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "hedgpix",
  description:
    "Congressional stock disclosures — trending tickers, House and Senate activity.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
