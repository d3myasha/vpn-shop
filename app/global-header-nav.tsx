"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type GlobalHeaderNavProps = {
  isAuthenticated: boolean;
  isOwner: boolean;
};

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function GlobalHeaderNav({ isAuthenticated, isOwner }: GlobalHeaderNavProps) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="global-nav" aria-label="Основная навигация">
      <Link href="/" className={`global-nav-link ${isActive(pathname, "/") ? "is-active" : ""}`}>
        Планы
      </Link>

      {isAuthenticated ? (
        <Link href="/account" className={`global-nav-link ${isActive(pathname, "/account") ? "is-active" : ""}`}>
          Личный кабинет
        </Link>
      ) : null}

      {isOwner ? (
        <Link href="/admin" className={`global-nav-link ${isActive(pathname, "/admin") ? "is-active" : ""}`}>
          Админка
        </Link>
      ) : null}

      {!isAuthenticated ? (
        <Link href="/login" className={`global-nav-link ${isActive(pathname, "/login") ? "is-active" : ""}`}>
          Вход
        </Link>
      ) : null}
    </nav>
  );
}
