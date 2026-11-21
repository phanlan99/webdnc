"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Nút "Làm mới": đọc lại dữ liệu từ Database mà không tải lại cả trang. */
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`size-4 ${pending ? "animate-spin" : ""}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
      </svg>
      {pending ? "Đang tải..." : "Làm mới"}
    </button>
  );
}