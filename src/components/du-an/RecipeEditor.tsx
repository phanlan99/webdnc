"use client";

import { useEffect, useState, useTransition } from "react";
import type { Recipe } from "@/lib/recipes";
import { targetLabel } from "@/lib/dnc-format";
import {
  OPERATORS,
  SOURCE_FIXED,
  defaultType,
  typesFor,
  validateRecipe,
  type ConditionInput,
  type ParamInput,
  type RecipeError,
  type RecipeInput,
} from "@/lib/recipe-rules";
import { saveRecipeAction } from "@/app/quan-ly-du-an/[projectCode]/actions";

// ====================================================
// FORM THÊM / SỬA MÃ HÀNG (hộp thoại toàn màn hình trên điện thoại)
//  - Thông tin: mã hàng, mô tả, dùng điều kiện chung
//  - Điều kiện riêng & Tham số gửi: thêm / xóa / đổi thứ tự dòng
//  - Kiểm tra dữ liệu ngay khi nhập; server kiểm tra lại trước khi ghi Database
// ====================================================

type Row<T> = T & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

/** Bỏ "key" (chỉ dùng cho giao diện) trước khi gửi lên server. */
function stripKey<T>(row: Row<T>): T {
  const { key, ...rest } = row;
  void key;
  return rest as T;
}

const emptyCondition = (target: string): Row<ConditionInput> => ({
  key: newKey(), enabled: true, target, address: "", dataType: defaultType(target), operator: "EQ", value: "", length: 10, note: "",
});

const emptyParam = (target: string): Row<ParamInput> => ({
  key: newKey(), enabled: true, target, address: "", dataType: defaultType(target), value: "", length: 10, note: "",
  source: SOURCE_FIXED, sourceAddress: "", sourceType: "Int16",
});

type Props = {
  projectCode: string;
  recipe: Recipe | null; // null = thêm mới
  targets: string[];     // thiết bị của dự án: MACRO, PMC, PLC, PLC:PLC2...
  onClose: () => void;
  onSaved: (mahang: string) => void;
};

export default function RecipeEditor({ projectCode, recipe, targets, onClose, onSaved }: Props) {
  const [mahang, setMahang] = useState(recipe?.mahang ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [useGlobal, setUseGlobal] = useState(recipe?.useGlobalConditions ?? true);
  const [conditions, setConditions] = useState<Row<ConditionInput>[]>(() =>
    (recipe?.conditions ?? []).map((c) => ({
      key: newKey(), enabled: c.enabled, target: c.target, address: c.address, dataType: c.dataType,
      operator: c.operator, value: c.value, length: c.length, note: c.note,
    }))
  );
  const [params, setParams] = useState<Row<ParamInput>[]>(() =>
    (recipe?.params ?? []).map((p) => ({
      key: newKey(), enabled: p.enabled, target: p.target, address: p.address, dataType: p.dataType, value: p.value,
      length: p.length, note: p.note, source: (p.source || SOURCE_FIXED).toUpperCase(), sourceAddress: p.sourceAddress, sourceType: p.sourceType,
    }))
  );
  const [showErrors, setShowErrors] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<RecipeError[]>([]);
  const [saving, startSaving] = useTransition();

  const input: RecipeInput = { mahang, description, useGlobalConditions: useGlobal, conditions, params };
  const errors = showErrors ? validateRecipe(input, targets) : [];
  const allErrors = errors.length > 0 ? errors : serverErrors;
  const rowHasError = (scope: "condition" | "param", i: number) => allErrors.some((e) => e.scope === scope && e.index === i);

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

  function save() {
    setShowErrors(true);
    setServerMessage(null);
    setServerErrors([]);
    if (validateRecipe(input, targets).length > 0) return;
    startSaving(async () => {
      const payload: RecipeInput = {
        mahang, description, useGlobalConditions: useGlobal,
        conditions: conditions.map(stripKey),
        params: params.map(stripKey),
      };
      const res = await saveRecipeAction(projectCode, recipe?.id ?? null, payload);
      if (res.ok) onSaved(mahang.trim());
      else {
        setServerMessage(res.message);
        setServerErrors(res.errors ?? []);
      }
    });
  }

  // ---------- thao tác dòng ----------
  function patch<T>(list: Row<T>[], setList: (v: Row<T>[]) => void, i: number, change: Partial<T>) {
    setList(list.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }
  function move<T>(list: Row<T>[], setList: (v: Row<T>[]) => void, i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  }
  // Đổi thiết bị -> kiểu dữ liệu tự chuyển về kiểu hợp lệ
  const typeFor = (target: string, current: string) => (typesFor(target).includes(current) ? current : defaultType(target));

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-6xl flex-col bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        {/* Tiêu đề */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{recipe ? `Sửa mã hàng ${recipe.mahang}` : "Thêm mã hàng mới"}</h2>
            <p className="text-xs text-slate-500">Dự án {projectCode}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {/* Nội dung */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
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

          {/* Thông tin */}
          <section className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <Field label="Mã hàng *">
              <input value={mahang} onChange={(e) => setMahang(e.target.value)} maxLength={100} placeholder="VD: MST10-50"
                className={`${inputCls} font-mono ${showErrors && !mahang.trim() ? "border-red-400" : ""}`} />
            </Field>
            <Field label="Mô tả">
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} className={inputCls} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input type="checkbox" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} className="size-4 accent-blue-600" />
              Dùng điều kiện chung của dự án (phải đạt hết mới gửi dữ liệu)
            </label>
          </section>

          {/* Điều kiện riêng */}
          <section>
            <SectionHeader title="Điều kiện riêng" hint="Đọc giá trị trên máy, phải đạt hết mới gửi dữ liệu"
              onAdd={() => setConditions([...conditions, emptyCondition(conditions.at(-1)?.target ?? "PLC")])} addLabel="Thêm điều kiện" />
            {conditions.length === 0 ? <Empty text="Không có điều kiện riêng." /> : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr><Th>Bật</Th><Th>Thiết bị</Th><Th>Địa chỉ</Th><Th>Kiểu</Th><Th>So sánh</Th><Th>Giá trị</Th><Th>Đ.dài</Th><Th>Ghi chú</Th><Th /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conditions.map((c, i) => (
                      <tr key={c.key} className={rowHasError("condition", i) ? "bg-red-50/60" : ""}>
                        <Td><input type="checkbox" checked={c.enabled} onChange={(e) => patch(conditions, setConditions, i, { enabled: e.target.checked })} className="size-4 accent-blue-600" /></Td>
                        <Td><TargetSelect value={c.target} targets={targets}
                          onChange={(t) => patch(conditions, setConditions, i, { target: t, dataType: typeFor(t, c.dataType) })} /></Td>
                        <Td><input value={c.address} onChange={(e) => patch(conditions, setConditions, i, { address: e.target.value })} placeholder={placeholderFor(c.target)} className={`${cellCls} w-28 font-mono`} /></Td>
                        <Td><Select value={c.dataType} options={typesFor(c.target)} onChange={(v) => patch(conditions, setConditions, i, { dataType: v })} /></Td>
                        <Td>
                          <select value={c.operator} onChange={(e) => patch(conditions, setConditions, i, { operator: e.target.value })} className={`${cellCls} w-16`}>
                            {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                          </select>
                        </Td>
                        <Td><input value={c.value} onChange={(e) => patch(conditions, setConditions, i, { value: e.target.value })} className={`${cellCls} w-28 font-mono`} /></Td>
                        <Td>{c.dataType === "String"
                          ? <input type="number" min={1} max={100} value={c.length} onChange={(e) => patch(conditions, setConditions, i, { length: Number(e.target.value) })} className={`${cellCls} w-16`} />
                          : <span className="text-slate-300">—</span>}</Td>
                        <Td><input value={c.note} onChange={(e) => patch(conditions, setConditions, i, { note: e.target.value })} className={`${cellCls} w-40`} /></Td>
                        <Td><RowActions onUp={() => move(conditions, setConditions, i, -1)} onDown={() => move(conditions, setConditions, i, 1)}
                          onRemove={() => setConditions(conditions.filter((_, idx) => idx !== i))} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Tham số gửi */}
          <section>
            <SectionHeader title="Tham số gửi xuống máy" hint="Gửi lần lượt từ trên xuống; dòng lỗi sẽ dừng các dòng sau"
              onAdd={() => setParams([...params, emptyParam(params.at(-1)?.target ?? "MACRO")])} addLabel="Thêm tham số" />
            {params.length === 0 ? <Empty text="Chưa có tham số." /> : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr><Th>Bật</Th><Th>Gửi tới</Th><Th>Địa chỉ</Th><Th>Kiểu</Th><Th>Nguồn giá trị</Th><Th>Giá trị / Địa chỉ nguồn</Th><Th>Kiểu nguồn</Th><Th>Đ.dài</Th><Th>Ghi chú</Th><Th /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {params.map((p, i) => {
                      const fixed = p.source === SOURCE_FIXED;
                      return (
                        <tr key={p.key} className={rowHasError("param", i) ? "bg-red-50/60" : ""}>
                          <Td><input type="checkbox" checked={p.enabled} onChange={(e) => patch(params, setParams, i, { enabled: e.target.checked })} className="size-4 accent-blue-600" /></Td>
                          <Td><TargetSelect value={p.target} targets={targets}
                            onChange={(t) => patch(params, setParams, i, { target: t, dataType: typeFor(t, p.dataType) })} /></Td>
                          <Td><input value={p.address} onChange={(e) => patch(params, setParams, i, { address: e.target.value })} placeholder={placeholderFor(p.target)} className={`${cellCls} w-28 font-mono`} /></Td>
                          <Td><Select value={p.dataType} options={typesFor(p.target)} onChange={(v) => patch(params, setParams, i, { dataType: v })} /></Td>
                          <Td>
                            <select value={p.source} className={`${cellCls} w-40`}
                              onChange={(e) => {
                                const s = e.target.value;
                                patch(params, setParams, i, { source: s, sourceType: s === SOURCE_FIXED ? p.sourceType : typeFor(s, p.sourceType) });
                              }}>
                              <option value={SOURCE_FIXED}>Giá trị cố định</option>
                              {targets.map((t) => <option key={t} value={t}>Sao chép từ {targetLabel(t)}</option>)}
                            </select>
                          </Td>
                          <Td>{fixed
                            ? <input value={p.value} onChange={(e) => patch(params, setParams, i, { value: e.target.value })} placeholder="Giá trị" className={`${cellCls} w-32 font-mono`} />
                            : <input value={p.sourceAddress} onChange={(e) => patch(params, setParams, i, { sourceAddress: e.target.value })} placeholder={placeholderFor(p.source)} className={`${cellCls} w-32 font-mono`} />}
                          </Td>
                          <Td>{fixed ? <span className="text-slate-300">—</span>
                            : <Select value={p.sourceType} options={typesFor(p.source)} onChange={(v) => patch(params, setParams, i, { sourceType: v })} />}</Td>
                          <Td>{p.dataType === "String" || (!fixed && p.sourceType === "String")
                            ? <input type="number" min={1} max={100} value={p.length} onChange={(e) => patch(params, setParams, i, { length: Number(e.target.value) })} className={`${cellCls} w-16`} />
                            : <span className="text-slate-300">—</span>}</Td>
                          <Td><input value={p.note} onChange={(e) => patch(params, setParams, i, { note: e.target.value })} className={`${cellCls} w-40`} /></Td>
                          <Td><RowActions onUp={() => move(params, setParams, i, -1)} onDown={() => move(params, setParams, i, 1)}
                            onRemove={() => setParams(params.filter((_, idx) => idx !== i))} /></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Nút */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Hủy
          </button>
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Đang lưu..." : recipe ? "Lưu thay đổi" : "Thêm mã hàng"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Thành phần nhỏ ----------------
const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const cellCls = "rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

function placeholderFor(target: string): string {
  if (target === "MACRO") return "500";
  if (target === "PMC") return "R100 / R100.3";
  return "D200 / M100";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, hint, onAdd, addLabel }: { title: string; hint: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <button type="button" onClick={onAdd} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">
        + {addLabel}
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">{text}</p>;
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-2 py-2 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-2 py-1.5 align-middle">{children}</td>;
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cellCls} w-24`}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TargetSelect({ value, targets, onChange }: { value: string; targets: string[]; onChange: (v: string) => void }) {
  // Giữ cả thiết bị cũ không còn trong dự án (VD: PLC đã gỡ) để người dùng thấy và đổi lại
  const list = targets.includes(value) ? targets : [...targets, value];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cellCls} w-40`}>
      {list.map((t) => <option key={t} value={t}>{targetLabel(t)}{targets.includes(t) ? "" : " (không còn)"}</option>)}
    </select>
  );
}

function RowActions({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  const btn = "rounded-md p-1.5 text-slate-500 hover:bg-slate-100";
  return (
    <div className="flex gap-0.5 whitespace-nowrap">
      <button type="button" onClick={onUp} className={btn} aria-label="Lên" title="Lên">↑</button>
      <button type="button" onClick={onDown} className={btn} aria-label="Xuống" title="Xuống">↓</button>
      <button type="button" onClick={onRemove} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label="Xóa dòng" title="Xóa dòng">✕</button>
    </div>
  );
}