"use client";

import { useEffect, useState, useTransition } from "react";
import type { Alarm, AlarmGroup } from "@/lib/alarms";
import { targetLabel } from "@/lib/dnc-format";
import { OPERATORS, defaultType, typesFor } from "@/lib/recipe-rules";
import { ALARM_LEVELS, nextAlarmCode, validateAlarm, type AlarmAttachInput, type AlarmError, type AlarmInput } from "@/lib/alarm-rules";
import { saveAlarmAction } from "@/app/quan-ly-du-an/[projectCode]/actions";

// ====================================================
// FORM THÊM / SỬA 1 CẢNH BÁO / LỖI (giống app C#)
//   Mã, Loại, Nguồn (FANUC), Thanh ghi + điều kiện, Báo xử lý, Nội dung VI / EN, Cách xử lý, Ghi chú, Thanh ghi gửi kèm
// ====================================================

type AttachRow = AlarmAttachInput & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

type Props = {
  projectCode: string;
  group: AlarmGroup;
  alarm: Alarm | null; // null = thêm mới
  onClose: () => void;
  onSaved: (code: string) => void;
};

export default function AlarmEditor({ projectCode, group, alarm, onClose, onSaved }: Props) {
  const isFanuc = group.key === "FANUC";
  const firstTarget = group.targets[0];
  const [form, setForm] = useState<Omit<AlarmInput, "attachments">>(() => ({
    enabled: alarm?.enabled ?? true,
    code: alarm?.code ?? nextAlarmCode(group.alarms.map((a) => a.code), isFanuc),
    level: alarm?.level ?? "ERROR",
    target: alarm?.target ?? firstTarget,
    address: alarm?.address ?? "",
    dataType: alarm?.dataType ?? "Bit",
    operator: alarm?.operator ?? "EQ",
    value: alarm?.value ?? "1",
    length: alarm?.length ?? 10,
    reportResolved: alarm?.reportResolved ?? true,
    messageVi: alarm?.messageVi ?? "",
    messageEn: alarm?.messageEn ?? "",
    solution: alarm?.solution ?? "",
    note: alarm?.note ?? "",
  }));
  const [attachments, setAttachments] = useState<AttachRow[]>(() =>
    (alarm?.attachments ?? []).map((t) => ({ key: newKey(), target: t.target, address: t.address, dataType: t.dataType, length: t.length, name: t.name }))
  );
  const [showErrors, setShowErrors] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<AlarmError[]>([]);
  const [saving, startSaving] = useTransition();

  const otherCodes = group.alarms.filter((a) => a.id !== alarm?.id).map((a) => a.code);
  const input: AlarmInput = { ...form, attachments: attachments.map(stripKey) };
  const errors = showErrors ? validateAlarm(input, group.targets, otherCodes) : [];
  const allErrors = errors.length > 0 ? errors : serverErrors;
  const bad = (field: string) => allErrors.some((e) => e.field === field);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, saving]);

  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });
  const typeFor = (target: string, current: string) => (typesFor(target).includes(current) ? current : target === "MACRO" ? "Real" : "Bit");

  function save() {
    setShowErrors(true);
    setServerMessage(null);
    setServerErrors([]);
    if (validateAlarm(input, group.targets, otherCodes).length > 0) return;
    startSaving(async () => {
      const res = await saveAlarmAction(projectCode, group.key, alarm?.id ?? null, input);
      if (res.ok) onSaved(form.code.trim().toUpperCase());
      else {
        setServerMessage(res.message);
        setServerErrors(res.errors ?? []);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-4xl flex-col bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{alarm ? `Sửa ${alarm.code}` : "Thêm cảnh báo / lỗi"}</h2>
            <p className="text-xs text-slate-500">Dự án {projectCode} • nhóm {group.label}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
          {(serverMessage || allErrors.length > 0) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {serverMessage && <p className="font-semibold">{serverMessage}</p>}
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{allErrors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}

          {/* Thông tin chung */}
          <section className="grid gap-4 sm:grid-cols-3">
            <Field label="Mã *">
              <input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} maxLength={50} className={`${inputCls} font-mono ${bad("code") ? errCls : ""}`} />
            </Field>
            <Field label="Loại">
              <div className="flex gap-2">
                {ALARM_LEVELS.map((l) => (
                  <button key={l.code} type="button" onClick={() => set({ level: l.code })}
                    className={`flex-1 rounded-lg border px-3 py-2 font-medium ${form.level === l.code
                      ? (l.code === "ERROR" ? "border-red-500 bg-red-50 text-red-700" : "border-amber-500 bg-amber-50 text-amber-700")
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <Check checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Bật giám sát cảnh báo này" />
              <Check checked={form.reportResolved} onChange={(v) => set({ reportResolved: v })} label="Báo ĐÃ XỬ LÝ khi điều kiện hết đúng" />
            </div>
          </section>

          {/* Điều kiện phát sinh */}
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800">Điều kiện phát sinh</h3>
            <p className="mb-3 text-xs text-slate-500">Phát sinh khi điều kiện chuyển từ SAI sang ĐÚNG (bit: sườn lên 0 → 1).</p>
            <div className="grid gap-3 sm:grid-cols-6">
              {isFanuc && (
                <Field label="Nguồn" className="sm:col-span-2">
                  <select value={form.target} onChange={(e) => set({ target: e.target.value, dataType: typeFor(e.target.value, form.dataType) })} className={inputCls}>
                    {group.targets.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Thanh ghi *" className="sm:col-span-2">
                <input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder={placeholderFor(form.target)}
                  className={`${inputCls} font-mono ${bad("address") ? errCls : ""}`} />
              </Field>
              <Field label="Kiểu">
                <select value={form.dataType} onChange={(e) => set({ dataType: e.target.value })} className={`${inputCls} ${bad("dataType") ? errCls : ""}`}>
                  {typesFor(form.target).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="So sánh">
                <select value={form.operator} onChange={(e) => set({ operator: e.target.value })} className={`${inputCls} ${bad("operator") ? errCls : ""}`}>
                  {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Giá trị">
                <input value={form.value} onChange={(e) => set({ value: e.target.value })} className={`${inputCls} font-mono ${bad("value") ? errCls : ""}`} />
              </Field>
              {form.dataType === "String" && (
                <Field label="Độ dài (word)">
                  <input type="number" min={1} max={100} value={form.length} onChange={(e) => set({ length: Number(e.target.value) })} className={inputCls} />
                </Field>
              )}
            </div>
          </section>

          {/* Nội dung */}
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Nội dung (Tiếng Việt)">
              <textarea value={form.messageVi} onChange={(e) => set({ messageVi: e.target.value })} rows={2} maxLength={500} className={inputCls} />
            </Field>
            <Field label="Nội dung (English)">
              <textarea value={form.messageEn} onChange={(e) => set({ messageEn: e.target.value })} rows={2} maxLength={500} className={inputCls} />
            </Field>
            <Field label="Cách xử lý">
              <textarea value={form.solution} onChange={(e) => set({ solution: e.target.value })} rows={2} maxLength={1000} className={inputCls} />
            </Field>
            <Field label="Ghi chú">
              <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={2} maxLength={500} className={inputCls} />
            </Field>
          </section>

          {/* Thanh ghi gửi kèm */}
          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-800">Thanh ghi gửi kèm</h3>
                <p className="text-xs text-slate-500">Đọc ngay lúc phát sinh / xử lý và ghi vào lịch sử để biết tình trạng máy khi đó.</p>
              </div>
              <button type="button"
                onClick={() => setAttachments([...attachments, { key: newKey(), target: firstTarget, address: "", dataType: defaultType(firstTarget), length: 10, name: "" }])}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100">
                + Thêm thanh ghi kèm
              </button>
            </div>
            {attachments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-slate-400">Không có thanh ghi gửi kèm.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[620px]">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>{isFanuc && <th className="px-2 py-2">Nguồn</th>}<th className="px-2 py-2">Địa chỉ</th><th className="px-2 py-2">Kiểu</th><th className="px-2 py-2">Đ.dài</th><th className="px-2 py-2">Tên</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attachments.map((t, i) => {
                      const patch = (c: Partial<AttachRow>) => setAttachments(attachments.map((r, idx) => (idx === i ? { ...r, ...c } : r)));
                      const rowBad = allErrors.some((e) => e.attachIndex === i);
                      return (
                        <tr key={t.key} className={rowBad ? "bg-red-50/60" : ""}>
                          {isFanuc && (
                            <td className="px-2 py-1.5">
                              <select value={t.target} onChange={(e) => patch({ target: e.target.value, dataType: typesFor(e.target.value).includes(t.dataType) ? t.dataType : defaultType(e.target.value) })} className={`${cellCls} w-32`}>
                                {group.targets.map((x) => <option key={x} value={x}>{targetLabel(x)}</option>)}
                              </select>
                            </td>
                          )}
                          <td className="px-2 py-1.5"><input value={t.address} onChange={(e) => patch({ address: e.target.value })} placeholder={placeholderFor(t.target)} className={`${cellCls} w-28 font-mono`} /></td>
                          <td className="px-2 py-1.5">
                            <select value={t.dataType} onChange={(e) => patch({ dataType: e.target.value })} className={`${cellCls} w-24`}>
                              {typesFor(t.target).map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">{t.dataType === "String"
                            ? <input type="number" min={1} max={100} value={t.length} onChange={(e) => patch({ length: Number(e.target.value) })} className={`${cellCls} w-16`} />
                            : <span className="text-slate-300">—</span>}</td>
                          <td className="px-2 py-1.5"><input value={t.name} onChange={(e) => patch({ name: e.target.value })} placeholder="VD: Bộ đếm" className={`${cellCls} w-full min-w-32`} /></td>
                          <td className="px-2 py-1.5 text-right">
                            <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label="Xóa dòng">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Hủy</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Đang lưu..." : alarm ? "Lưu thay đổi" : "Thêm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function stripKey(row: AttachRow): AlarmAttachInput {
  const { key, ...rest } = row;
  void key;
  return rest;
}

const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const cellCls = "rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const errCls = "border-red-400 bg-red-50/40";

function placeholderFor(target: string): string {
  if (target === "MACRO") return "500";
  if (target === "PMC") return "R100.3";
  return "M100 / D100";
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-blue-600" />
      {label}
    </label>
  );
}