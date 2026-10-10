import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/context/AuthProvider";
import { NightShell } from "@/components/NightShell";
import { OnboardingModal } from "@/components/OnboardingModal";
import { TelemetryProvider } from "@/context/TelemetryProvider";
import { VitalsAlertPopup } from "@/components/VitalsAlertPopup";
import { PwaRegister } from "@/components/PwaRegister";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

// The one typeface across the site: Gontserrat Light.
const gontserrat = localFont({
  src: "./fonts/Gontserrat-Light.ttf",
  weight: "300",
  style: "normal",
  variable: "--font-gontserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A sleep-aware baby monitor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b15",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${gontserrat.variable} h-full`}>
      <head>
        <link rel="preload" as="script" href="/sw.js" />
      </head>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <TelemetryProvider>
            <NightShell>{children}</NightShell>
            <VitalsAlertPopup />
          </TelemetryProvider>
          <OnboardingModal />
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
