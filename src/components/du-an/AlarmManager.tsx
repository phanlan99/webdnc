"use client";

import { useState, useTransition } from "react";
import type { Alarm, AlarmGroup } from "@/lib/alarms";
import { addressLabel, formatDate, operatorLabel, targetColor, targetLabel } from "@/lib/dnc-format";
import { deleteAlarmAction, moveAlarmAction } from "@/app/quan-ly-du-an/[projectCode]/actions";
import AlarmEditor from "./AlarmEditor";
import AlarmFileTools from "./AlarmFileTools";

// ====================================================
// TAB CẢNH BÁO / LỖI: chọn nhóm (PLC1, PLC2..., FANUC) -> xem / thêm / sửa / xóa / sắp xếp cảnh báo
// ====================================================

type Props = { projectCode: string; groups: AlarmGroup[]; canEdit: boolean; loadError?: string };

export default function AlarmManager({ projectCode, groups, canEdit, loadError }: Props) {
  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? "PLC1");
  const [editing, setEditing] = useState<Alarm | "new" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [pending, startPending] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  const group = groups.find((g) => g.key === groupKey) ?? groups[0];
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Không đọc được cấu hình cảnh báo</p>
        <p className="mt-1 text-sm text-red-600">{loadError}</p>
      </div>
    );
  }
  if (!group) return null;

  const k = keyword.trim().toLowerCase();
  const alarms = k
    ? group.alarms.filter((a) => [a.code, a.messageVi, a.messageEn, a.address, a.note].some((v) => v.toLowerCase().includes(k)))
    : group.alarms;

  function run(id: number, task: () => Promise<{ ok: boolean; message?: string }>, okText?: string) {
    setMessage(null);
    setBusyId(id);
    startPending(async () => {
      const res = await task();
      setBusyId(null);
      if (!res.ok) setMessage({ ok: false, text: res.message ?? "Lỗi" });
      else if (okText) setMessage({ ok: true, text: okText });
    });
  }

  function remove(a: Alarm) {
    if (!window.confirm(`Xóa ${a.level === "WARNING" ? "cảnh báo" : "lỗi"} ${a.code}?\n\nLịch sử lỗi / cảnh báo đã ghi vẫn được giữ.`)) return;
    run(a.id, () => deleteAlarmAction(projectCode, group.key, a.id), `Đã xóa ${a.code}.`);
  }

  return (
    <div className="space-y-4">
      {/* Chọn nhóm */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button key={g.key} type="button" onClick={() => { setGroupKey(g.key); setMessage(null); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              g.key === group.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>
            {g.label} <span className="opacity-70">({g.alarms.length})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm mã, nội dung, thanh ghi..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-80" />
        <span className="text-sm text-slate-500">
          {group.alarms.filter((a) => a.level === "ERROR").length} lỗi • {group.alarms.filter((a) => a.level === "WARNING").length} cảnh báo
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <AlarmFileTools projectCode={projectCode} canEdit={canEdit} onMessage={setMessage}
            currentCounts={Object.fromEntries(groups.map((g) => [g.key, g.alarms.length]))} />
          {canEdit && (
            <button type="button" onClick={() => { setMessage(null); setEditing("new"); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              + Thêm cảnh báo / lỗi
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <p className="text-xs text-amber-700">
          Sửa trên web xong, app C# cần bấm &quot;Nạp Lại&quot; ở tab CẢNH BÁO của {group.key === "FANUC" ? "FANUC" : group.key} để giám sát theo cấu hình mới.
        </p>
      )}

      {message && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {alarms.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {group.alarms.length === 0 ? `Nhóm ${group.label} chưa có cảnh báo / lỗi nào.` : "Không tìm thấy cảnh báo phù hợp."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Mã</th>
                <th className="px-3 py-2.5 font-semibold">Loại</th>
                <th className="px-3 py-2.5 font-semibold">Điều kiện phát sinh</th>
                <th className="px-3 py-2.5 font-semibold">Nội dung</th>
                <th className="px-3 py-2.5 font-semibold">Cách xử lý</th>
                <th className="px-3 py-2.5 font-semibold">Gửi kèm</th>
                <th className="px-3 py-2.5 font-semibold">Báo xử lý</th>
                {canEdit && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alarms.map((a) => {
                const idx = group.alarms.indexOf(a);
                const busy = pending && busyId === a.id;
                return (
                  <tr key={a.id} className={`${a.enabled ? "" : "bg-slate-50/70 text-slate-400"} ${busy ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 align-top">
                      <span className="font-mono font-semibold">{a.code}</span>
                      {!a.enabled && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">Tắt</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.level === "ERROR" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                        {a.level === "ERROR" ? "Lỗi" : "Cảnh báo"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                      {group.key === "FANUC" && <span className={`mr-1 rounded-md px-1.5 py-0.5 text-xs ${targetColor(a.target)}`}>{targetLabel(a.target)}</span>}
                      <span className="font-mono font-semibold">{addressLabel(a.target, a.address)}</span>{" "}
                      <span className="font-mono">{operatorLabel(a.operator)} {a.dataType === "String" ? `"${a.value}"` : a.value}</span>
                      <span className="block text-xs text-slate-400">{a.dataType}</span>
                    </td>
                    <td className="max-w-xs px-3 py-2.5 align-top">
                      <p className="font-medium text-slate-800">{a.messageVi || "—"}</p>
                      {a.messageEn && <p className="text-xs text-slate-500">{a.messageEn}</p>}
                    </td>
                    <td className="max-w-xs px-3 py-2.5 align-top text-slate-600">{a.solution || "—"}</td>
                    <td className="px-3 py-2.5 align-top text-xs">
                      {a.attachments.length === 0 ? "—" : a.attachments.map((t) => (
                        <span key={t.id} className="mr-1 mb-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                          {t.name ? `${t.name}(${addressLabel(t.target, t.address)})` : addressLabel(t.target, t.address)}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 align-top">{a.reportResolved ? "✔" : "—"}</td>
                    {canEdit && (
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <button type="button" disabled={busy || idx === 0 || !!k} onClick={() => run(a.id, () => moveAlarmAction(projectCode, group.key, a.id, -1))}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Lên">↑</button>
                        <button type="button" disabled={busy || idx === group.alarms.length - 1 || !!k} onClick={() => run(a.id, () => moveAlarmAction(projectCode, group.key, a.id, 1))}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Xuống">↓</button>
                        <button type="button" disabled={busy} onClick={() => { setMessage(null); setEditing(a); }}
                          className="ml-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">Sửa</button>
                        <button type="button" disabled={busy} onClick={() => remove(a)}
                          className="ml-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Xóa</button>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(a.updatedAt)}{a.updatedBy && ` • ${a.updatedBy}`}</p>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AlarmEditor
          projectCode={projectCode}
          group={group}
          alarm={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(code) => { setEditing(null); setMessage({ ok: true, text: `Đã lưu ${code} (nhóm ${group.label}).` }); }}
        />
      )}
    </div>
  );
}