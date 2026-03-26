import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { GlobalHeaderNav } from "./global-header-nav";

export const metadata: Metadata = {
  title: "VPN Shop",
  description: "Магазин VPN-подписок"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const isOwner = session?.user?.role === "OWNER";

  return (
    <html lang="ru">
      <body>
        <header className="global-header">
          <div className="container global-header-inner">
            <p className="global-header-brand">VPN Shop</p>
            <GlobalHeaderNav isAuthenticated={isAuthenticated} isOwner={isOwner} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
