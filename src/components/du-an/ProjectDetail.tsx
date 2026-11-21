import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getProjectDetail } from "@/lib/recipes";
import { getProjectTargets } from "@/lib/recipe-write";
import { formatDate } from "@/lib/dnc-format";
import GlobalConditionSection from "./GlobalConditionSection";
import RecipeBrowser from "./RecipeBrowser";

// ====================================================
// CHI TIẾT 1 DỰ ÁN (Server Component - đọc Database trực tiếp, không cần api/)
//   Thông tin dự án + Điều kiện chung + Danh sách mã hàng (tham số, điều kiện riêng)
// ====================================================

export default async function ProjectDetail({ params }: { params: Promise<{ projectCode: string }> }) {
  await connection(); // luôn đọc dữ liệu mới nhất
  const { projectCode: raw } = await params;
  const projectCode = safeDecode(raw).toUpperCase();
  const result = await getProjectDetail(projectCode);

  if (!result.ok && result.notFound) notFound();
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Không đọc được dữ liệu dự án {projectCode}</p>
        <p className="mt-1 text-sm text-red-600">{result.error}</p>
      </div>
    );
  }

  const p = result.project;
  const targets = await getProjectTargets(p.projectCode);          // thiết bị dùng được khi thêm / sửa mã hàng
  const canEdit = process.env.DNC_WEB_ALLOW_EDIT === "true";        // công tắc an toàn trong .env.local
  const totalParams = p.recipes.reduce((s, r) => s + r.params.length, 0);

  return (
    <div className="space-y-6">
      {/* Thông tin dự án */}
      <div>
        <Link href="/quan-ly-du-an" className="text-sm text-blue-600 hover:underline">← Danh sách dự án</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-sm font-semibold text-blue-700">{p.projectCode}</span>
          <h1 className="text-2xl font-semibold text-slate-800">{p.projectName || p.projectCode}</h1>
        </div>
        {p.description && <p className="mt-1 text-slate-500">{p.description}</p>}
        <p className="mt-1 text-xs text-slate-400">
          Cập nhật {formatDate(p.updatedAt)}
          {p.updatedByMachine && ` • máy ${p.updatedByMachine}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl sm:gap-4">
        <Stat label="Mã hàng" value={p.recipes.length} />
        <Stat label="Tham số" value={totalParams} />
        <Stat label="Điều kiện chung" value={p.globalConditions.length} />
      </div>

      {/* Điều kiện chung - xem / thêm / sửa / xóa */}
      <GlobalConditionSection projectCode={p.projectCode} conditions={p.globalConditions} targets={targets} canEdit={canEdit} />

      {/* Mã hàng */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Mã hàng</h2>
        {canEdit ? (
          <p className="mb-3 text-xs text-amber-700">
            Sửa trên web xong, app C# cần bấm &quot;Nạp lại&quot; ở tab DỮ LIỆU để thấy thay đổi — nếu app C# lưu dữ liệu cũ của nó, thay đổi trên web sẽ bị ghi đè.
          </p>
        ) : (
          <p className="mb-3 text-xs text-slate-400">Chế độ chỉ xem (bật chỉnh sửa: DNC_WEB_ALLOW_EDIT=true trong .env.local).</p>
        )}
        <RecipeBrowser projectCode={p.projectCode} recipes={p.recipes} targets={targets} canEdit={canEdit} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">{value}</p>
    </div>
  );
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}