"use client";

import { useRef, useState, useTransition } from "react";
import { parseCsv } from "@/lib/recipe-csv";
import { readAlarmRows, type AlarmImportResult } from "@/lib/alarm-file";
import { exportAlarmsAction, importAlarmsAction, previewAlarmsExcelAction } from "@/app/quan-ly-du-an/[projectCode]/actions";
import { arrayBufferToBase64, base64ToBlob, downloadBlob, fileKind, readCsvText, XLSX_MIME } from "@/lib/browser-file";

// ====================================================
// XUẤT / NHẬP FILE CẢNH BÁO / LỖI (Excel .xlsx + CSV)
// Nhập: xem trước + kiểm tra lỗi -> chỉ THAY các nhóm có trong file, nhóm khác giữ nguyên
// ====================================================

type Props = {
  projectCode: string;
  canEdit: boolean;
  currentCounts: Record<string, number>; // số cảnh báo hiện có theo nhóm
  onMessage: (m: { ok: boolean; text: string }) => void;
};

type Preview = {
  kind: "csv" | "xlsx";
  fileName: string;
  payload: string;
  stats: AlarmImportResult["stats"];
  issues: AlarmImportResult["issues"];
  groups: { key: string; count: number }[];
};

export default function AlarmFileTools({ projectCode, canEdit, currentCounts, onMessage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, startBusy] = useTransition();
  const [importing, startImport] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; issues: string[] } | null>(null);

  function exportFile(kind: "xlsx" | "csv") {
    startBusy(async () => {
      const res = await exportAlarmsAction(projectCode, kind);
      if (!res.ok) return onMessage({ ok: false, text: res.message });
      downloadBlob(kind === "xlsx" ? base64ToBlob(res.data, XLSX_MIME) : new Blob([res.data], { type: "text/csv;charset=utf-8" }), res.fileName);
      onMessage({ ok: true, text: `Đã xuất ${res.fileName}.` });
    });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = fileKind(file.name);
    if (kind === "xls") return onMessage({ ok: false, text: "File .xls chưa hỗ trợ — trong Excel chọn Save As > Excel Workbook (.xlsx)." });
    if (kind === "other") return onMessage({ ok: false, text: "Chỉ nhận file .xlsx hoặc .csv." });

    if (kind === "xlsx") {
      startBusy(async () => {
        const base64 = arrayBufferToBase64(await file.arrayBuffer());
        const res = await previewAlarmsExcelAction(projectCode, base64); // server đọc & kiểm tra, chưa ghi gì
        if (!res.ok) return onMessage({ ok: false, text: res.message });
        open({ kind, fileName: file.name, payload: base64, stats: res.stats, issues: res.issues, groups: res.groups });
      });
      return;
    }
    const text = await readCsvText(file);
    const data = readAlarmRows(parseCsv(text));
    open({ kind, fileName: file.name, payload: text, stats: data.stats, issues: data.issues,
      groups: data.groups.map((g) => ({ key: g.key, count: g.alarms.length })) });
  }

  function open(p: Preview) {
    setPreview(p);
    setUnderstood(false);
    setServerError(null);
  }

  function doImport() {
    if (!preview) return;
    startImport(async () => {
      const res = await importAlarmsAction(projectCode, preview.kind, preview.payload);
      if (!res.ok) {
        setServerError({ message: res.message, issues: (res.issues ?? []).map((i) => (i.line ? `Dòng ${i.line}: ` : "") + i.message) });
        return;
      }
      setPreview(null);
      onMessage({ ok: true, text: `Đã nhập ${res.alarms} cảnh báo / lỗi cho nhóm ${res.groups.join(", ")}.` });
    });
  }

  const issues = preview?.issues ?? [];

  return (
    <>
      <button type="button" onClick={() => exportFile("xlsx")} disabled={busy} className={btnCls}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 text-emerald-600"><rect x="4" y="3" width="16" height="18" rx="2" /><path strokeLinecap="round" d="m9 8 6 8m0-8-6 8" /></svg>
        Xuất Excel
      </button>
      <button type="button" onClick={() => exportFile("csv")} disabled={busy} className={btnCls}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
        Xuất CSV
      </button>
      {canEdit && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btnCls}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" /></svg>
            Nhập file
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={onPickFile} className="hidden" />
        </>
      )}
      {busy && <span className="text-xs text-slate-500">Đang xử lý...</span>}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-full w-full max-w-2xl flex-col bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Nhập cảnh báo / lỗi từ {preview.kind === "xlsx" ? "Excel" : "CSV"}</h2>
              <p className="truncate text-xs text-slate-500">{preview.fileName} → dự án {projectCode}</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Cảnh báo / lỗi" value={preview.stats.alarms} />
                <Stat label="Lỗi" value={preview.stats.errors} tone="text-red-600" />
                <Stat label="Cảnh báo" value={preview.stats.warnings} tone="text-amber-600" />
                <Stat label="Thanh ghi kèm" value={preview.stats.attachments} />
              </div>

              {issues.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-semibold">File có {issues.length} lỗi — sửa file rồi chọn lại:</p>
                  <ul className="mt-1 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {issues.slice(0, 50).map((i, idx) => <li key={idx}>{i.line ? `Dòng ${i.line}: ` : ""}{i.message}</li>)}
                    {issues.length > 50 && <li>... và {issues.length - 50} lỗi khác</li>}
                  </ul>
                </div>
              ) : preview.groups.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">File không có cảnh báo nào (dòng CANHBAO).</p>
              ) : (
                <>
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                    <p className="font-semibold">⚠ Các nhóm sau sẽ bị THAY TOÀN BỘ</p>
                    <ul className="mt-2 space-y-1">
                      {preview.groups.map((g) => (
                        <li key={g.key} className="flex items-center gap-2">
                          <span className="w-16 rounded bg-white px-2 py-0.5 text-center font-mono text-xs font-semibold">{g.key}</span>
                          <span>{currentCounts[g.key] ?? 0} cảnh báo hiện có → <b>{g.count}</b> cảnh báo trong file</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">Nhóm không có trong file giữ nguyên. Lịch sử lỗi / cảnh báo không bị ảnh hưởng.</p>
                  </div>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 accent-blue-600" />
                    <span>Tôi hiểu cấu hình cũ của các nhóm trên sẽ bị thay thế (nên bấm &quot;Xuất Excel&quot; để sao lưu trước).</span>
                  </label>
                </>
              )}

              {serverError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-semibold">{serverError.message}</p>
                  {serverError.issues.length > 0 && (
                    <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">{serverError.issues.slice(0, 30).map((t, i) => <li key={i}>{t}</li>)}</ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPreview(null)} disabled={importing}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Hủy</button>
              <button type="button" onClick={doImport} disabled={importing || issues.length > 0 || preview.groups.length === 0 || !understood}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {importing ? "Đang nhập..." : "Thay cấu hình cảnh báo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnCls = "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

function Stat({ label, value, tone = "text-slate-800" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}