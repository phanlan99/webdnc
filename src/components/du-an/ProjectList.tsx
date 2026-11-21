import { connection } from "next/server";
import { getProjects, type Project } from "@/lib/projects";

// ====================================================
// DANH SÁCH DỰ ÁN (Server Component)
// Truy vấn Database trực tiếp trên server, không cần thư mục api/
// Máy tính: dạng bảng | Điện thoại: dạng thẻ
// ====================================================

export default async function ProjectList() {
  await connection(); // luôn lấy dữ liệu mới nhất mỗi lần mở trang (không dựng sẵn lúc build)
  const result = await getProjects();

  if (!result.ok) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Không đọc được danh sách dự án</p>
        <p className="mt-1 text-sm text-red-600">{result.error}</p>
        <p className="mt-3 text-xs text-red-500">
          Kiểm tra file <code className="rounded bg-red-100 px-1">.env.local</code>, sửa xong thì tắt rồi chạy lại{" "}
          <code className="rounded bg-red-100 px-1">npm run dev</code>.
        </p>
      </div>
    );
  }

  const { projects } = result;
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        Chưa có dự án nào trong bảng <code className="rounded bg-slate-100 px-1">dnc_project</code>.
      </div>
    );
  }

  const totalRecipes = projects.reduce((sum, p) => sum + p.recipeCount, 0);

  return (
    <div className="space-y-4">
      {/* Tổng quan nhanh */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Stat label="Dự án" value={projects.length} />
        <Stat label="Mã hàng" value={totalRecipes} />
      </div>

      {/* Máy tính: bảng */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Mã dự án</th>
              <th className="px-4 py-3 font-semibold">Tên dự án</th>
              <th className="px-4 py-3 font-semibold">Mô tả</th>
              <th className="px-4 py-3 text-right font-semibold">Mã hàng</th>
              <th className="px-4 py-3 font-semibold">Máy cập nhật</th>
              <th className="px-4 py-3 font-semibold">Cập nhật lúc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
                    {p.projectCode}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{p.projectName || "—"}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={p.description}>
                  {p.description || "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-700">{p.recipeCount}</td>
                <td className="px-4 py-3 text-slate-500">{p.updatedByMachine || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Điện thoại: thẻ */}
      <div className="space-y-3 md:hidden">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">{p.projectCode}</span>
          <p className="mt-2 font-semibold text-slate-800">{p.projectName || "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-800">{p.recipeCount}</p>
          <p className="text-xs text-slate-500">mã hàng</p>
        </div>
      </div>
      {p.description && <p className="mt-2 text-sm text-slate-500">{p.description}</p>}
      <p className="mt-3 text-xs text-slate-400">
        Cập nhật {formatDate(p.updatedAt)}
        {p.updatedByMachine && ` • máy ${p.updatedByMachine}`}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

/** "2026-10-23 09:15:02" -> "23/10/2026 09:15" */
function formatDate(value: string | null): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : value;
}