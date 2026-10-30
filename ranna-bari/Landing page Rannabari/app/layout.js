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

export const metadata = {
  title: "RannaBari — Home-cooked meals in Bangladesh",
  description:
    "RannaBari connects home cooks in Bangladesh with people who want a proper home-cooked meal. Order a plate, pre-book a month of meals, or buy from a cook's pantry — with every cook identity-checked and every payment held in escrow until the food arrives.",
};

/* `lang="en"` because the copy is English. Switch to "bn" with the copy, not
   before — a Bengali lang tag over English text misleads screen readers. */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
