"use client";

import { useRef, useState, useTransition } from "react";
import { readRecipesCsv, type CsvImportResult, type CsvIssue } from "@/lib/recipe-csv";
import {
  exportRecipesCsvAction,
  exportRecipesExcelAction,
  importRecipesCsvAction,
  importRecipesExcelAction,
  previewRecipesExcelAction,
} from "@/app/quan-ly-du-an/[projectCode]/actions";

// ====================================================
// XUẤT / NHẬP FILE MÃ HÀNG CỦA DỰ ÁN: EXCEL (.xlsx) và CSV
//  - Xuất Excel / Xuất CSV: tải file về để sửa hàng loạt
//  - Nhập file (.xlsx hoặc .csv): xem trước + kiểm tra lỗi, xác nhận rồi THAY TOÀN BỘ mã hàng của dự án
// ====================================================

type Props = {
  projectCode: string;
  targets: string[];
  canEdit: boolean;
  currentRecipeCount: number;
  onMessage: (m: { ok: boolean; text: string }) => void;
};

type Preview = {
  kind: "csv" | "xlsx";
  fileName: string;
  payload: string;                       // csv: nội dung chữ | xlsx: base64
  stats: CsvImportResult["stats"];
  issues: CsvIssue[];
};

export default function RecipeFileTools({ projectCode, targets, canEdit, currentRecipeCount, onMessage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, startBusy] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");
  const [importing, startImport] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [replaceGlobals, setReplaceGlobals] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; issues: string[] } | null>(null);

  // ---------------- Xuất ----------------
  function exportFile(kind: "xlsx" | "csv") {
    setBusyLabel(kind === "xlsx" ? "Đang xuất Excel..." : "Đang xuất CSV...");
    startBusy(async () => {
      if (kind === "xlsx") {
        const res = await exportRecipesExcelAction(projectCode);
        if (!res.ok) return onMessage({ ok: false, text: res.message });
        download(base64ToBlob(res.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), res.fileName);
        onMessage({ ok: true, text: `Đã xuất ${res.fileName}.` });
      } else {
        const res = await exportRecipesCsvAction(projectCode);
        if (!res.ok) return onMessage({ ok: false, text: res.message });
        download(new Blob([res.csv], { type: "text/csv;charset=utf-8" }), res.fileName);
        onMessage({ ok: true, text: `Đã xuất ${res.fileName}.` });
      }
    });
  }

  // ---------------- Nhập: chọn file -> xem trước ----------------
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // chọn lại cùng file vẫn nhận
    if (!file) return;
    const name = file.name.toLowerCase();

    if (name.endsWith(".xls")) {
      onMessage({ ok: false, text: "File .xls (Excel 97-2003) chưa hỗ trợ — trong Excel chọn Save As > Excel Workbook (.xlsx)." });
      return;
    }

    if (name.endsWith(".xlsx")) {
      setBusyLabel("Đang đọc file Excel...");
      startBusy(async () => {
        const base64 = arrayBufferToBase64(await file.arrayBuffer());
        const res = await previewRecipesExcelAction(projectCode, base64); // server đọc & kiểm tra, chưa ghi gì
        if (!res.ok) return onMessage({ ok: false, text: res.message });
        openPreview({ kind: "xlsx", fileName: file.name, payload: base64, stats: res.stats, issues: res.issues });
      });
      return;
    }

    // CSV: đọc & kiểm tra ngay trên trình duyệt
    const text = await readCsvText(file);
    const data = readRecipesCsv(text, targets);
    openPreview({ kind: "csv", fileName: file.name, payload: text, stats: data.stats, issues: data.issues });
  }

  function openPreview(p: Preview) {
    setPreview(p);
    setReplaceGlobals(p.stats.globals > 0);
    setUnderstood(false);
    setServerError(null);
  }

  // ---------------- Nhập: xác nhận -> ghi Database ----------------
  function doImport() {
    if (!preview) return;
    startImport(async () => {
      const res = preview.kind === "xlsx"
        ? await importRecipesExcelAction(projectCode, preview.payload, replaceGlobals)
        : await importRecipesCsvAction(projectCode, preview.payload, replaceGlobals);
      if (!res.ok) {
        setServerError({ message: res.message, issues: (res.issues ?? []).map((i) => (i.line ? `Dòng ${i.line}: ` : "") + i.message) });
        return;
      }
      setPreview(null);
      onMessage({
        ok: true,
        text: `Đã nhập ${res.recipes} mã hàng (${res.params} tham số, ${res.conditions} điều kiện riêng)` +
          (res.globals !== null ? `, ${res.globals} điều kiện chung` : "") + ` vào dự án ${projectCode}.`,
      });
    });
  }

  const issues = preview?.issues ?? [];

  return (
    <>
      <button type="button" onClick={() => exportFile("xlsx")} disabled={busy} className={btnCls} title="Tải file Excel (.xlsx)">
        <ExcelIcon /> Xuất Excel
      </button>
      <button type="button" onClick={() => exportFile("csv")} disabled={busy} className={btnCls} title="Tải file CSV">
        <DownloadIcon /> Xuất CSV
      </button>
      {canEdit && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btnCls} title="Chọn file .xlsx hoặc .csv">
            <UploadIcon /> Nhập file
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onPickFile} className="hidden" />
        </>
      )}
      {busy && <span className="text-xs text-slate-500">{busyLabel}</span>}

      {/* Hộp thoại xem trước khi nhập */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-full w-full max-w-2xl flex-col bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Nhập mã hàng từ {preview.kind === "xlsx" ? "Excel" : "CSV"}</h2>
              <p className="truncate text-xs text-slate-500">{preview.fileName} → dự án {projectCode}</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Mã hàng" value={preview.stats.recipes} />
                <Stat label="Tham số" value={preview.stats.params} />
                <Stat label="Điều kiện riêng" value={preview.stats.conditions} />
                <Stat label="Điều kiện chung" value={preview.stats.globals} />
              </div>

              {issues.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-semibold">File có {issues.length} lỗi — sửa file rồi chọn lại:</p>
                  <ul className="mt-1 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {issues.slice(0, 50).map((i, idx) => <li key={idx}>{i.line ? `Dòng ${i.line}: ` : ""}{i.message}</li>)}
                    {issues.length > 50 && <li>... và {issues.length - 50} lỗi khác</li>}
                  </ul>
                </div>
              ) : preview.stats.recipes === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">File không có mã hàng nào (dòng MAHANG).</p>
              ) : (
                <>
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                    <p className="font-semibold">⚠ Dữ liệu cũ sẽ bị thay thế</p>
                    <p className="mt-1">
                      Toàn bộ <b>{currentRecipeCount}</b> mã hàng hiện tại của dự án <b>{projectCode}</b> (cùng tham số, điều kiện riêng) sẽ bị
                      <b> xóa</b> và thay bằng <b>{preview.stats.recipes}</b> mã hàng trong file.
                    </p>
                  </div>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={replaceGlobals} onChange={(e) => setReplaceGlobals(e.target.checked)} className="mt-0.5 size-4 accent-blue-600" />
                    <span>
                      Thay luôn <b>điều kiện chung</b> bằng {preview.stats.globals} dòng DIEUKIENCHUNG trong file
                      <span className="block text-xs text-slate-500">Bỏ tích: giữ nguyên điều kiện chung đang có của dự án.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 accent-blue-600" />
                    <span>Tôi hiểu dữ liệu mã hàng cũ sẽ bị thay thế (nên bấm &quot;Xuất Excel&quot; để sao lưu trước).</span>
                  </label>
                </>
              )}

              {serverError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-semibold">{serverError.message}</p>
                  {serverError.issues.length > 0 && (
                    <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                      {serverError.issues.slice(0, 30).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPreview(null)} disabled={importing}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Hủy</button>
              <button type="button" onClick={doImport}
                disabled={importing || issues.length > 0 || preview.stats.recipes === 0 || !understood}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {importing ? "Đang nhập..." : "Thay toàn bộ mã hàng"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- Tiện ích file ----------------
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Đọc CSV: ưu tiên UTF-8; nếu Excel lưu kiểu "CSV (Comma delimited)" (bảng mã Windows) thì đọc bằng windows-1258. */
async function readCsvText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1258").decode(buf);
  }
}

const btnCls = "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 text-emerald-600">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path strokeLinecap="round" d="m9 8 6 8m0-8-6 8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" />
    </svg>
  );
}