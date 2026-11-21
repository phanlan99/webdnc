"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

// ====================================================
// SIDEBAR - menu bên trái, nền sáng, hỗ trợ mobile
//  - Máy tính (>= 768px): menu cố định bên trái
//  - Điện thoại / máy tính bảng nhỏ: thanh trên cùng có nút ☰, bấm để trượt menu ra
// Không đặt trong layout: trang nào cần thì tự thêm <Sidebar />
// Muốn thêm mục mới: thêm 1 dòng vào MENU_ITEMS
// ====================================================

type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const MENU_ITEMS: MenuItem[] = [
  { href: "/", label: "Trang chủ", icon: <HomeIcon /> },
  { href: "/quan-ly-du-an", label: "Quản lý dự án", icon: <FolderIcon /> },
  { href: "/cai-dat", label: "Cài đặt", icon: <SettingsIcon /> },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false); // menu đang mở trên mobile

  // Khi menu mở trên mobile: khóa cuộn trang, bấm Esc để đóng, phóng to sang màn hình lớn thì tự đóng
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onResize = () => {
      if (desktop.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Thanh trên cùng - chỉ hiện trên mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <MenuIcon />
        </button>
        <Logo />
      </header>

      {/* Lớp nền mờ phía sau menu (mobile) - bấm vào để đóng */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/30 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Menu */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200
          md:sticky md:top-0 md:z-auto md:h-screen md:shrink-0 md:translate-x-0 md:shadow-none
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Tên ứng dụng (+ nút đóng trên mobile) */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
            className="-mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Danh mục - phần đọc đường dẫn (usePathname) đặt trong Suspense để dùng được ở cả trang động như /quan-ly-du-an/[mã] */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <Suspense fallback={<MenuList pathname={null} onNavigate={() => setOpen(false)} />}>
            <MenuLinks onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>

        {/* Chân sidebar */}
        <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-400">WEB DNC © 2026</div>
      </aside>
    </>
  );
}

/** Đọc đường dẫn hiện tại để tô sáng mục đang mở. */
function MenuLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return <MenuList pathname={pathname} onNavigate={onNavigate} />;
}

function MenuList({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  // "/" chỉ sáng khi đúng trang chủ; các mục khác sáng cả ở trang con (VD: /quan-ly-du-an/REMAINBAR)
  const isActive = (href: string) =>
    pathname !== null && (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <>
      {MENU_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate} // chọn mục xong thì đóng menu (mobile)
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className={active ? "text-blue-600" : "text-slate-400"}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">D</span>
      <span className="text-lg font-semibold text-slate-800">WEB DNC</span>
    </div>
  );
}

// ---------------- Biểu tượng (SVG, không cần cài thêm thư viện) ----------------
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.5h8.4A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.6c.4-1.5 2.9-1.5 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.4-.8 3 .8 2.2 2.2a1.7 1.7 0 0 0 1.1 2.6c1.5.4 1.5 2.9 0 3.4a1.7 1.7 0 0 0-1.1 2.6c.8 1.4-.8 3-2.2 2.2a1.7 1.7 0 0 0-2.6 1.1c-.4 1.5-2.9 1.5-3.4 0a1.7 1.7 0 0 0-2.6-1.1c-1.4.8-3-.8-2.2-2.2a1.7 1.7 0 0 0-1.1-2.6c-1.5-.4-1.5-2.9 0-3.4a1.7 1.7 0 0 0 1.1-2.6c-.8-1.4.8-3 2.2-2.2a1.7 1.7 0 0 0 2.6-1.1Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-6">
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
      <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}