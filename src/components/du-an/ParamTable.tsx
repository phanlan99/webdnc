import type { RecipeParam } from "@/lib/recipes";
import { addressLabel, targetColor, targetLabel } from "@/lib/dnc-format";

// Bảng tham số gửi xuống FANUC / PLC của 1 mã hàng (theo đúng thứ tự gửi)
export default function ParamTable({ params }: { params: RecipeParam[] }) {
  if (params.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">Chưa có tham số.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-12 px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Gửi tới</th>
            <th className="px-3 py-2 font-semibold">Địa chỉ</th>
            <th className="px-3 py-2 font-semibold">Kiểu</th>
            <th className="px-3 py-2 font-semibold">Giá trị gửi</th>
            <th className="px-3 py-2 font-semibold">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {params.map((p, i) => {
            const isCopy = p.source && p.source.toUpperCase() !== "FIXED";
            return (
              <tr key={p.id} className={p.enabled ? "" : "bg-slate-50/60 text-slate-400"}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${targetColor(p.target)}`}>{targetLabel(p.target)}</span>
                </td>
                <td className="px-3 py-2 font-mono font-semibold">{addressLabel(p.target, p.address)}</td>
                <td className="px-3 py-2">
                  {p.dataType}
                  {p.dataType === "String" && <span className="text-xs text-slate-400"> ({p.length} word)</span>}
                </td>
                <td className="px-3 py-2">
                  {isCopy ? (
                    // Giá trị lấy từ 1 địa chỉ khác ngay lúc gửi
                    <span className="text-sm">
                      <span className="text-slate-400">Sao chép từ </span>
                      <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${targetColor(p.source)}`}>{targetLabel(p.source)}</span>{" "}
                      <span className="font-mono font-semibold">{addressLabel(p.source, p.sourceAddress)}</span>
                      <span className="text-xs text-slate-400"> ({p.sourceType})</span>
                    </span>
                  ) : (
                    <span className="font-mono font-semibold text-slate-800">{p.dataType === "String" ? `"${p.value}"` : p.value || "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {p.note}
                  {!p.enabled && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">Tắt</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}