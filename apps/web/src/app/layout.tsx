import { SiteHeader } from "@/components/site-header";
import { TRPCProvider } from "@/lib/trpc/client";
import { Toaster } from "@surffit/ui/components/ui/sonner";
import { TooltipProvider } from "@surffit/ui/components/ui/tooltip";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SurfFit",
  description: "Track your surf sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TRPCProvider>
          <TooltipProvider>
            <SiteHeader />
            {children}
          </TooltipProvider>
          <Toaster richColors />
        </TRPCProvider>
      </body>
    </html>
  );
}
