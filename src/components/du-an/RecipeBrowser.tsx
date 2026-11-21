"use client";

import { useDeferredValue, useState, useTransition } from "react";
import type { Recipe } from "@/lib/recipes";
import { formatDate } from "@/lib/dnc-format";
import { deleteRecipeAction } from "@/app/quan-ly-du-an/[projectCode]/actions";
import ConditionTable from "./ConditionTable";
import ParamTable from "./ParamTable";
import RecipeEditor from "./RecipeEditor";
import CsvTools from "./CsvTools";

// ====================================================
// DANH SÁCH MÃ HÀNG CỦA DỰ ÁN (chạy trên trình duyệt)
//  - Tìm kiếm theo mã hàng / mô tả
//  - Bấm vào 1 mã hàng để xem điều kiện riêng + tham số gửi
//  - Thêm / Sửa / Xóa mã hàng (khi .env.local có DNC_WEB_ALLOW_EDIT=true)
// ====================================================

type Props = {
  projectCode: string;
  recipes: Recipe[];
  targets: string[];   // thiết bị của dự án: MACRO, PMC, PLC, PLC:PLC2...
  canEdit: boolean;
};

export default function RecipeBrowser({ projectCode, recipes, targets, canEdit }: Props) {
  const [keyword, setKeyword] = useState("");
  const deferred = useDeferredValue(keyword); // gõ nhanh không bị giật khi có nhiều mã hàng
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, startDeleting] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const k = deferred.trim().toLowerCase();
  const filtered = k ? recipes.filter((r) => r.mahang.toLowerCase().includes(k) || r.description.toLowerCase().includes(k)) : recipes;

  function remove(r: Recipe) {
    if (!window.confirm(`Xóa mã hàng "${r.mahang}"?\n\nToàn bộ tham số và điều kiện riêng của mã hàng này cũng bị xóa.`)) return;
    setMessage(null);
    setDeletingId(r.id);
    startDeleting(async () => {
      const res = await deleteRecipeAction(projectCode, r.id);
      setDeletingId(null);
      setMessage(res.ok ? { ok: true, text: `Đã xóa mã hàng ${r.mahang}.` } : { ok: false, text: res.message });
    });
  }

  function closeEditor(saved?: string) {
    setEditing(null);
    if (saved) setMessage({ ok: true, text: saved });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm mã hàng..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <span className="text-sm text-slate-500">
          {k ? `${filtered.length} / ${recipes.length} mã hàng` : `${recipes.length} mã hàng`}
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <CsvTools projectCode={projectCode} targets={targets} canEdit={canEdit} currentRecipeCount={recipes.length} onMessage={setMessage} />
          {canEdit && (
            <button
              type="button"
              onClick={() => { setMessage(null); setEditing("new"); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Thêm mã hàng
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {recipes.length === 0 ? "Dự án chưa có mã hàng nào." : "Không tìm thấy mã hàng phù hợp."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <RecipeItem
              key={r.id}
              recipe={r}
              canEdit={canEdit}
              busy={deleting && deletingId === r.id}
              onEdit={() => { setMessage(null); setEditing(r); }}
              onDelete={() => remove(r)}
            />
          ))}
        </div>
      )}

      {editing && (
        <RecipeEditor
          projectCode={projectCode}
          recipe={editing === "new" ? null : editing}
          targets={targets}
          onClose={() => closeEditor()}
          onSaved={(mahang) => closeEditor(editing === "new" ? `Đã thêm mã hàng ${mahang}.` : `Đã lưu mã hàng ${mahang}.`)}
        />
      )}
    </div>
  );
}

function RecipeItem({ recipe: r, canEdit, busy, onEdit, onDelete }: {
  recipe: Recipe; canEdit: boolean; busy: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const activeParams = r.params.filter((p) => p.enabled).length;
  const activeConds = r.conditions.filter((c) => c.enabled).length;
  // Nút trong <summary>: chặn để bấm nút không bị mở/đóng dòng
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };

  return (
    <details className={`group rounded-xl border border-slate-200 bg-white open:shadow-sm ${busy ? "opacity-50" : ""}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
        </svg>
        <span className="font-mono text-base font-semibold text-slate-800">{r.mahang}</span>
        {r.description && <span className="text-sm text-slate-500">{r.description}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <Badge className="bg-blue-50 text-blue-700">{activeParams}/{r.params.length} tham số</Badge>
          <Badge className="bg-orange-50 text-orange-700">{activeConds} điều kiện riêng</Badge>
          {r.useGlobalConditions ? (
            <Badge className="bg-emerald-50 text-emerald-700">Dùng điều kiện chung</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-500">Không dùng điều kiện chung</Badge>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={stop(onEdit)} disabled={busy}
                className="rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100">Sửa</button>
              <button type="button" onClick={stop(onDelete)} disabled={busy}
                className="rounded-md border border-red-200 px-2.5 py-1 font-medium text-red-600 hover:bg-red-50">{busy ? "Đang xóa..." : "Xóa"}</button>
            </>
          )}
        </span>
      </summary>

      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <p className="text-xs text-slate-400">
          Cập nhật {formatDate(r.updatedAt)}
          {r.machine && ` • máy ${r.machine}`}
        </p>
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Điều kiện riêng</h4>
          <ConditionTable conditions={r.conditions} />
        </section>
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Tham số gửi xuống máy (theo thứ tự gửi)</h4>
          <ParamTable params={r.params} />
        </section>
      </div>
    </details>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 font-medium ${className}`}>{children}</span>;
}