import "server-only";
import { describeDbError, query } from "@/lib/db";

// ====================================================
// DỮ LIỆU MÃ HÀNG CỦA 1 DỰ ÁN (bảng do app C# DNC tạo)
//   dnc_project            : thông tin dự án
//   dnc_global_condition   : điều kiện chung của dự án
//   dnc_recipe             : mã hàng
//   dnc_recipe_condition   : điều kiện riêng của mã hàng
//   dnc_recipe_param       : tham số gửi xuống FANUC / PLC
// ====================================================

export type Condition = {
  id: number;
  order: number;
  enabled: boolean;
  target: string;      // MACRO / PMC / PLC / PLC:PLC2 ...
  address: string;
  dataType: string;
  operator: string;    // EQ NE GT GE LT LE
  value: string;
  length: number;
  note: string;
  machine?: string;    // chỉ có ở điều kiện chung
};

export type RecipeParam = {
  id: number;
  order: number;
  enabled: boolean;
  target: string;
  address: string;
  dataType: string;
  value: string;
  length: number;
  note: string;
  source: string;        // FIXED = giá trị cố định, hoặc thiết bị nguồn khi sao chép
  sourceAddress: string;
  sourceType: string;
};

export type Recipe = {
  id: number;
  mahang: string;
  description: string;
  machine: string;
  useGlobalConditions: boolean;
  updatedAt: string | null;
  conditions: Condition[];
  params: RecipeParam[];
};

export type ProjectDetail = {
  projectCode: string;
  projectName: string;
  description: string;
  updatedByMachine: string;
  updatedAt: string | null;
  globalConditions: Condition[];
  recipes: Recipe[];
};

export type ProjectDetailResult =
  | { ok: true; project: ProjectDetail }
  | { ok: false; notFound: true }
  | { ok: false; notFound?: false; error: string };

type ProjectRow = { project_code: string; project_name: string; description: string; updated_by_machine: string; updated_at: string | null };
type RecipeRow = { id: number; mahang: string; description: string; machine_code: string; use_global_conditions: number; updated_at: string | null };
type ConditionRow = {
  id: number; recipe_id?: number; sort_order: number; enabled: number; target_kind: string; address: string; data_type: string;
  compare_op: string; compare_value: string; str_length: number; note: string; machine_code?: string;
};
type ParamRow = {
  id: number; recipe_id: number; sort_order: number; enabled: number; target_kind: string; address: string; data_type: string;
  param_value: string; str_length: number; note: string; source_kind: string; source_address: string; source_type: string;
};

function toCondition(r: ConditionRow): Condition {
  return {
    id: r.id, order: r.sort_order, enabled: Number(r.enabled) !== 0, target: r.target_kind, address: r.address,
    dataType: r.data_type, operator: r.compare_op, value: r.compare_value, length: r.str_length, note: r.note,
    machine: r.machine_code,
  };
}

/** Toàn bộ dữ liệu mã hàng của 1 dự án (5 truy vấn, gom nhóm phía server). */
export async function getProjectDetail(projectCode: string): Promise<ProjectDetailResult> {
  try {
    const [project] = await query<ProjectRow>(
      "SELECT project_code, project_name, description, updated_by_machine, updated_at FROM dnc_project WHERE project_code = ? LIMIT 1",
      [projectCode]
    );
    if (!project) return { ok: false, notFound: true };

    const globalRows = await query<ConditionRow>(
      `SELECT id, sort_order, enabled, target_kind, address, data_type, compare_op, compare_value, str_length, note, machine_code
       FROM dnc_global_condition WHERE project_code = ? ORDER BY sort_order, id`,
      [projectCode]
    );
    const recipeRows = await query<RecipeRow>(
      `SELECT id, mahang, description, machine_code, use_global_conditions, updated_at
       FROM dnc_recipe WHERE project_code = ? ORDER BY mahang`,
      [projectCode]
    );
    const conditionRows = await query<ConditionRow>(
      `SELECT c.id, c.recipe_id, c.sort_order, c.enabled, c.target_kind, c.address, c.data_type, c.compare_op, c.compare_value, c.str_length, c.note
       FROM dnc_recipe_condition c JOIN dnc_recipe r ON r.id = c.recipe_id
       WHERE r.project_code = ? ORDER BY c.recipe_id, c.sort_order, c.id`,
      [projectCode]
    );
    const paramRows = await query<ParamRow>(
      `SELECT p.id, p.recipe_id, p.sort_order, p.enabled, p.target_kind, p.address, p.data_type, p.param_value, p.str_length, p.note,
              p.source_kind, p.source_address, p.source_type
       FROM dnc_recipe_param p JOIN dnc_recipe r ON r.id = p.recipe_id
       WHERE r.project_code = ? ORDER BY p.recipe_id, p.sort_order, p.id`,
      [projectCode]
    );

    // Gom điều kiện / tham số theo mã hàng
    const conditionsByRecipe = new Map<number, Condition[]>();
    for (const c of conditionRows) {
      const list = conditionsByRecipe.get(c.recipe_id!) ?? [];
      list.push(toCondition(c));
      conditionsByRecipe.set(c.recipe_id!, list);
    }
    const paramsByRecipe = new Map<number, RecipeParam[]>();
    for (const p of paramRows) {
      const list = paramsByRecipe.get(p.recipe_id) ?? [];
      list.push({
        id: p.id, order: p.sort_order, enabled: Number(p.enabled) !== 0, target: p.target_kind, address: p.address,
        dataType: p.data_type, value: p.param_value, length: p.str_length, note: p.note,
        source: p.source_kind || "FIXED", sourceAddress: p.source_address, sourceType: p.source_type,
      });
      paramsByRecipe.set(p.recipe_id, list);
    }

    return {
      ok: true,
      project: {
        projectCode: project.project_code,
        projectName: project.project_name,
        description: project.description,
        updatedByMachine: project.updated_by_machine,
        updatedAt: project.updated_at,
        globalConditions: globalRows.map(toCondition),
        recipes: recipeRows.map((r) => ({
          id: r.id,
          mahang: r.mahang,
          description: r.description,
          machine: r.machine_code,
          useGlobalConditions: Number(r.use_global_conditions) !== 0,
          updatedAt: r.updated_at,
          conditions: conditionsByRecipe.get(r.id) ?? [],
          params: paramsByRecipe.get(r.id) ?? [],
        })),
      },
    };
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
}