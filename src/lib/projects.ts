import "server-only";
import { describeDbError, query } from "@/lib/db";

// ====================================================
// DỮ LIỆU DỰ ÁN - bảng dnc_project (tạo bởi app C# DNC)
//   id, project_code, project_name, description, updated_by_machine, created_at, updated_at
// Kèm số mã hàng của từng dự án (bảng dnc_recipe)
// ====================================================

export type Project = {
  id: number;
  projectCode: string;
  projectName: string;
  description: string;
  updatedByMachine: string;
  createdAt: string | null;
  updatedAt: string | null;
  recipeCount: number;
};

export type ProjectsResult =
  | { ok: true; projects: Project[] }
  | { ok: false; error: string };

type ProjectRow = {
  id: number;
  project_code: string;
  project_name: string;
  description: string;
  updated_by_machine: string;
  created_at: string | null;
  updated_at: string | null;
  recipe_count: number | string | null;
};

/** Lấy danh sách dự án. Không ném lỗi: trả về { ok: false, error } để trang hiển thị thông báo. */
export async function getProjects(): Promise<ProjectsResult> {
  try {
    const rows = await query<ProjectRow>(`
      SELECT p.id, p.project_code, p.project_name, p.description, p.updated_by_machine,
             p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM dnc_recipe r WHERE r.project_code = p.project_code) AS recipe_count
      FROM dnc_project p
      ORDER BY p.project_code
    `);

    return {
      ok: true,
      projects: rows.map((r) => ({
        id: r.id,
        projectCode: r.project_code,
        projectName: r.project_name,
        description: r.description,
        updatedByMachine: r.updated_by_machine,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        recipeCount: Number(r.recipe_count ?? 0),
      })),
    };
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
}