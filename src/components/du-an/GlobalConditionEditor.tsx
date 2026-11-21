"use client";

import { useEffect, useState, useTransition } from "react";
import type { Condition } from "@/lib/recipes";
import { targetLabel } from "@/lib/dnc-format";
import { OPERATORS, defaultType, typesFor, validateGlobalConditions, type GlobalConditionInput, type RecipeError } from "@/lib/recipe-rules";
import { saveGlobalConditionsAction } from "@/app/quan-ly-du-an/[projectCode]/actions";

// ====================================================
// FORM SỬA ĐIỀU KIỆN CHUNG CỦA DỰ ÁN
// Thêm / xóa / sửa / đổi thứ tự nhiều dòng, bấm Lưu để ghi tất cả (1 transaction)
// ====================================================

type Row = GlobalConditionInput & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

const emptyRow = (target: string): Row => ({
  key: newKey(), enabled: true, target, address: "", dataType: defaultType(target), operator: "EQ", value: "", length: 10, note: "", machine: "",
});

function stripKey(row: Row): GlobalConditionInput {
  const { key, ...rest } = row;
  void key;
  return rest;
}

type Props = {
  projectCode: string;
  conditions: Condition[];
  targets: string[];
  addNew: boolean;               // true: mở form và thêm sẵn 1 dòng mới
  onClose: () => void;
  onSaved: (count: number) => void;
};

export default function GlobalConditionEditor({ projectCode, conditions, targets, addNew, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(() => {
    const list: Row[] = conditions.map((c) => ({
      key: newKey(), enabled: c.enabled, target: c.target, address: c.address, dataType: c.dataType, operator: c.operator,
      value: c.value, length: c.length, note: c.note, machine: c.machine ?? "",
    }));
    return addNew ? [...list, emptyRow(list.at(-1)?.target ?? "PLC")] : list;
  });
  const [showErrors, setShowErrors] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<RecipeError[]>([]);
  const [saving, startSaving] = useTransition();

  const errors = showErrors ? validateGlobalConditions(rows, targets) : [];
  const allErrors = errors.length > 0 ? errors : serverErrors;
  const rowHasError = (i: number) => allErrors.some((e) => e.index === i);

  // Esc để đóng, khóa cuộn trang phía sau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, saving]);

  const patch = (i: number, change: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const typeFor = (target: string, current: string) => (typesFor(target).includes(current) ? current : defaultType(target));

  function save() {
    setShowErrors(true);
    setServerMessage(null);
    setServerErrors([]);
    if (validateGlobalConditions(rows, targets).length > 0) return;
    if (rows.length === 0 && conditions.length > 0 &&
        !window.confirm(`Xóa hết ${conditions.length} điều kiện chung của dự án ${projectCode}?`)) return;
    startSaving(async () => {
      const res = await saveGlobalConditionsAction(projectCode, rows.map(stripKey));
      if (res.ok) onSaved(rows.length);
      else {
        setServerMessage(res.message);
        setServerErrors(res.errors ?? []);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-6xl flex-col bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Điều kiện chung</h2>
            <p className="text-xs text-slate-500">
              Dự án {projectCode} — áp dụng cho mọi mã hàng có bật &quot;Dùng điều kiện chung&quot;, phải đạt hết mới gửi dữ liệu
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {(serverMessage || allErrors.length > 0) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {serverMessage && <p className="font-semibold">{serverMessage}</p>}
              {allErrors.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {allErrors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}
                  {allErrors.length > 8 && <li>... và {allErrors.length - 8} lỗi khác</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">{rows.length} điều kiện — kiểm tra lần lượt từ trên xuống</p>
            <button type="button" onClick={() => setRows([...rows, emptyRow(rows.at(-1)?.target ?? "PLC")])}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">
              + Thêm điều kiện
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              Không có điều kiện chung. Bấm &quot;+ Thêm điều kiện&quot; để tạo mới.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <Th>#</Th><Th>Bật</Th><Th>Thiết bị</Th><Th>Địa chỉ</Th><Th>Kiểu</Th><Th>So sánh</Th><Th>Giá trị</Th><Th>Đ.dài</Th>
                    <Th>Máy</Th><Th>Ghi chú</Th><Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c, i) => (
                    <tr key={c.key} className={rowHasError(i) ? "bg-red-50/60" : ""}>
                      <Td><span className="text-slate-400">{i + 1}</span></Td>
                      <Td><input type="checkbox" checked={c.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} className="size-4 accent-blue-600" /></Td>
                      <Td>
                        <select value={c.target} onChange={(e) => patch(i, { target: e.target.value, dataType: typeFor(e.target.value, c.dataType) })} className={`${cellCls} w-40`}>
                          {(targets.includes(c.target) ? targets : [...targets, c.target]).map((t) => (
                            <option key={t} value={t}>{targetLabel(t)}{targets.includes(t) ? "" : " (không còn)"}</option>
                          ))}
                        </select>
                      </Td>
                      <Td><input value={c.address} onChange={(e) => patch(i, { address: e.target.value })} placeholder={placeholderFor(c.target)} className={`${cellCls} w-28 font-mono`} /></Td>
                      <Td>
                        <select value={c.dataType} onChange={(e) => patch(i, { dataType: e.target.value })} className={`${cellCls} w-24`}>
                          {typesFor(c.target).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Td>
                      <Td>
                        <select value={c.operator} onChange={(e) => patch(i, { operator: e.target.value })} className={`${cellCls} w-16`}>
                          {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                        </select>
                      </Td>
                      <Td><input value={c.value} onChange={(e) => patch(i, { value: e.target.value })} className={`${cellCls} w-28 font-mono`} /></Td>
                      <Td>{c.dataType === "String"
                        ? <input type="number" min={1} max={100} value={c.length} onChange={(e) => patch(i, { length: Number(e.target.value) })} className={`${cellCls} w-16`} />
                        : <span className="text-slate-300">—</span>}</Td>
                      <Td><input value={c.machine} onChange={(e) => patch(i, { machine: e.target.value })} placeholder="Tất cả" maxLength={50} className={`${cellCls} w-24`} /></Td>
                      <Td><input value={c.note} onChange={(e) => patch(i, { note: e.target.value })} className={`${cellCls} w-44`} /></Td>
                      <Td>
                        <div className="flex gap-0.5 whitespace-nowrap">
                          <button type="button" onClick={() => move(i, -1)} className={iconBtn} title="Lên" aria-label="Lên">↑</button>
                          <button type="button" onClick={() => move(i, 1)} className={iconBtn} title="Xuống" aria-label="Xuống">↓</button>
                          <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Xóa dòng" aria-label="Xóa dòng">✕</button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-400">Cột &quot;Máy&quot;: để trống = áp dụng cho mọi máy; nhập mã máy (VD: M01) = chỉ áp dụng cho máy đó.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Hủy
          </button>
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Đang lưu..." : "Lưu điều kiện chung"}
          </button>
        </div>
      </div>
    </div>
  );
}

const cellCls = "rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const iconBtn = "rounded-md p-1.5 text-slate-500 hover:bg-slate-100";

function placeholderFor(target: string): string {
  if (target === "MACRO") return "500";
  if (target === "PMC") return "R100 / R100.3";
  return "D200 / M100";
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-2 py-2 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-2 py-1.5 align-middle">{children}</td>;
}