import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IceFresh — лёд для бизнеса и дома",
  description: "Лёд в стакане 250 г и термопакетах 1 кг и 2 кг для бизнеса, мероприятий и дома.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
