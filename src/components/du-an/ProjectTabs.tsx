"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// ====================================================
// TAB TRÊN TRANG DỰ ÁN (dạng nút lớn, dính trên cùng khi cuộn)
// Tab đang mở lưu trên đường dẫn (#ma-hang, #dieu-kien-chung, #canh-bao):
// tải lại trang / gửi đường dẫn cho người khác vẫn mở đúng tab
// ====================================================

export type ProjectTab = {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  badge?: number;
  tone: "blue" | "emerald" | "rose";
  content: ReactNode;
};

const TONES = {
  blue: { on: "border-blue-500 bg-white ring-2 ring-blue-100", icon: "bg-blue-600 text-white", badge: "bg-blue-100 text-blue-700" },
  emerald: { on: "border-emerald-500 bg-white ring-2 ring-emerald-100", icon: "bg-emerald-600 text-white", badge: "bg-emerald-100 text-emerald-700" },
  rose: { on: "border-rose-500 bg-white ring-2 ring-rose-100", icon: "bg-rose-600 text-white", badge: "bg-rose-100 text-rose-700" },
};

// Đọc tab từ "#..." trên đường dẫn (server luôn hiển thị tab đầu)
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => decodeURIComponent(window.location.hash.slice(1));

export default function ProjectTabs({ tabs }: { tabs: ProjectTab[] }) {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const active = tabs.some((t) => t.key === hash) ? hash : tabs[0]?.key;

  const select = (key: string) => {
    // Đổi "#..." mà không nhảy trang (history.replaceState không phát sự kiện -> tự báo)
    history.replaceState(null, "", `#${key}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <div>
      {/* Thanh tab: dính dưới thanh menu mobile (top-14) / sát mép trên máy tính */}
      <div className="sticky top-14 z-20 -mx-6 mb-5 bg-slate-50/95 px-6 py-3 backdrop-blur md:top-0 md:-mx-8 md:px-8">
        <div role="tablist" className="grid grid-cols-3 gap-2 sm:gap-3">
          {tabs.map((t) => {
            const on = t.key === active;
            const tone = TONES[t.tone];
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => select(t.key)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all sm:px-4 sm:py-3 ${
                  on ? `${tone.on} shadow-sm` : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <span className={`hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex ${on ? tone.icon : "bg-slate-100 text-slate-500"}`}>
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm font-semibold ${on ? "text-slate-900" : "text-slate-600"}`}>{t.label}</span>
                    {t.badge !== undefined && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${on ? tone.badge : "bg-slate-100 text-slate-500"}`}>{t.badge}</span>
                    )}
                  </span>
                  <span className="hidden truncate text-xs text-slate-500 lg:block">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Giữ mọi tab trong trang (chỉ ẩn) để không mất ô tìm kiếm / dòng đang mở khi chuyển tab */}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={t.key !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}