import type { Condition } from "@/lib/recipes";
import { addressLabel, operatorLabel, targetColor, targetLabel } from "@/lib/dnc-format";

// Bảng điều kiện (dùng cho điều kiện chung của dự án và điều kiện riêng của mã hàng)
export default function ConditionTable({ conditions, showMachine = false }: { conditions: Condition[]; showMachine?: boolean }) {
  if (conditions.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">Không có điều kiện.</p>;
  }
  const hasMachine = showMachine && conditions.some((c) => c.machine);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-12 px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Thiết bị</th>
            <th className="px-3 py-2 font-semibold">Địa chỉ</th>
            <th className="px-3 py-2 font-semibold">Kiểu</th>
            <th className="px-3 py-2 font-semibold">Điều kiện</th>
            {hasMachine && <th className="px-3 py-2 font-semibold">Máy</th>}
            <th className="px-3 py-2 font-semibold">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {conditions.map((c, i) => (
            <tr key={c.id} className={c.enabled ? "" : "bg-slate-50/60 text-slate-400"}>
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${targetColor(c.target)}`}>{targetLabel(c.target)}</span>
              </td>
              <td className="px-3 py-2 font-mono font-semibold">{addressLabel(c.target, c.address)}</td>
              <td className="px-3 py-2">{c.dataType}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">
                {operatorLabel(c.operator)} {c.dataType === "String" ? `"${c.value}"` : c.value}
              </td>
              {hasMachine && <td className="px-3 py-2">{c.machine || "Tất cả"}</td>}
              <td className="px-3 py-2 text-slate-500">
                {c.note}
                {!c.enabled && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">Tắt</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}