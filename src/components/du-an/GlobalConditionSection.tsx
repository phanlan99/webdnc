"use client";

import { useState, useTransition } from "react";
import type { Condition } from "@/lib/recipes";
import { saveGlobalConditionsAction } from "@/app/quan-ly-du-an/[projectCode]/actions";
import ConditionTable from "./ConditionTable";
import GlobalConditionEditor from "./GlobalConditionEditor";

// ====================================================
// KHUNG ĐIỀU KIỆN CHUNG TRÊN TRANG DỰ ÁN
// Xem bảng + nút Thêm / Sửa / Xóa hết (khi .env.local có DNC_WEB_ALLOW_EDIT=true)
// ====================================================

type Props = {
  projectCode: string;
  conditions: Condition[];
  targets: string[];
  canEdit: boolean;
};

export default function GlobalConditionSection({ projectCode, conditions, targets, canEdit }: Props) {
  const [editor, setEditor] = useState<"edit" | "add" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [clearing, startClearing] = useTransition();

  function clearAll() {
    if (!window.confirm(`Xóa hết ${conditions.length} điều kiện chung của dự án ${projectCode}?\n\nCác mã hàng "Dùng điều kiện chung" sẽ không còn điều kiện chung nào.`)) return;
    setMessage(null);
    startClearing(async () => {
      const res = await saveGlobalConditionsAction(projectCode, []);
      setMessage(res.ok ? { ok: true, text: "Đã xóa hết điều kiện chung." } : { ok: false, text: res.message });
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Điều kiện chung</h2>
          <p className="text-sm text-slate-500">
            Áp dụng cho mọi mã hàng có bật &quot;Dùng điều kiện chung&quot; — phải đạt hết thì mới gửi dữ liệu.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setMessage(null); setEditor("add"); }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              + Thêm điều kiện
            </button>
            {conditions.length > 0 && (
              <>
                <button type="button" onClick={() => { setMessage(null); setEditor("edit"); }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Sửa / Xóa / Sắp xếp
                </button>
                <button type="button" onClick={clearAll} disabled={clearing}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
                  {clearing ? "Đang xóa..." : "Xóa hết"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <ConditionTable conditions={conditions} showMachine />

      {editor && (
        <GlobalConditionEditor
          projectCode={projectCode}
          conditions={conditions}
          targets={targets}
          addNew={editor === "add"}
          onClose={() => setEditor(null)}
          onSaved={(count) => {
            setEditor(null);
            setMessage({ ok: true, text: `Đã lưu ${count} điều kiện chung.` });
          }}
        />
      )}
    </section>
  );
}