import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://icefresh.kz"),
  title: "IceFresh — лёд для бизнеса и дома",
  description: "Лёд в стакане 250 г и термопакетах 1 кг и 2 кг для бизнеса, мероприятий и дома.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "ru_KZ",
    url: "https://icefresh.kz",
    siteName: "IceFresh",
    title: "IceFresh — лёд для бизнеса и дома",
    description: "Лёд в стакане и термопакетах. Заказы для бизнеса, мероприятий и дома.",
    images: [
      {
        url: "/icefresh-social.png",
        width: 1760,
        height: 917,
        alt: "Лёд IceFresh в стакане и термопакетах",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IceFresh — лёд для бизнеса и дома",
    description: "Лёд в стакане и термопакетах. Заказы для бизнеса, мероприятий и дома.",
    images: ["/icefresh-social.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
