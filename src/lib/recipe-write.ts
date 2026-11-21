import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDb, query } from "@/lib/db";
import { BASE_TARGETS, SOURCE_FIXED, normalizeAddress, type RecipeInput } from "@/lib/recipe-rules";

// ====================================================
// GHI DỮ LIỆU MÃ HÀNG VÀO DATABASE (thêm / sửa / xóa) - chỉ chạy trên server
// Mỗi thao tác là 1 transaction: lỗi giữa chừng -> hoàn tác toàn bộ, không để dữ liệu dở dang.
// ====================================================

const WEB_MACHINE = "WEB"; // ghi vào updated_by_machine để biết thay đổi đến từ website

/** Các thiết bị dự án đang có: MACRO, PMC, PLC (PLC1) + PLC mở rộng trong dnc_plc_device. */
export async function getProjectTargets(projectCode: string): Promise<string[]> {
  try {
    const rows = await query<{ plc_code: string }>(
      "SELECT plc_code FROM dnc_plc_device WHERE project_code = ? ORDER BY sort_order, plc_code",
      [projectCode]
    );
    return [...BASE_TARGETS, ...rows.map((r) => `PLC:${r.plc_code.toUpperCase()}`)];
  } catch {
    return [...BASE_TARGETS]; // chưa có bảng PLC mở rộng
  }
}

async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getDb().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function insertChildren(conn: PoolConnection, recipeId: number, input: RecipeInput) {
  for (const [i, c] of input.conditions.entries()) {
    await conn.execute(
      `INSERT INTO dnc_recipe_condition (recipe_id, sort_order, enabled, target_kind, address, data_type, compare_op, compare_value, str_length, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipeId, i, c.enabled ? 1 : 0, c.target, normalizeAddress(c.target, c.address), c.dataType, c.operator, c.value ?? "",
       c.length, (c.note ?? "").trim()]
    );
  }
  for (const [i, p] of input.params.entries()) {
    const fixed = p.source === SOURCE_FIXED;
    await conn.execute(
      `INSERT INTO dnc_recipe_param (recipe_id, sort_order, enabled, target_kind, address, data_type, param_value, str_length, note,
                                     source_kind, source_address, source_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipeId, i, p.enabled ? 1 : 0, p.target, normalizeAddress(p.target, p.address), p.dataType, fixed ? (p.value ?? "") : "",
       p.length, (p.note ?? "").trim(), fixed ? SOURCE_FIXED : p.source, fixed ? "" : normalizeAddress(p.source, p.sourceAddress),
       fixed ? "Int16" : p.sourceType]
    );
  }
}

async function touchProject(conn: PoolConnection, projectCode: string) {
  await conn.execute("UPDATE dnc_project SET updated_by_machine = ?, updated_at = CURRENT_TIMESTAMP WHERE project_code = ?", [WEB_MACHINE, projectCode]);
}

/** Thêm mã hàng mới. Trả về id mã hàng. */
export async function createRecipe(projectCode: string, input: RecipeInput): Promise<number> {
  return inTransaction(async (conn) => {
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO dnc_recipe (project_code, machine_code, mahang, description, use_global_conditions) VALUES (?, '', ?, ?, ?)",
      [projectCode, input.mahang.trim(), (input.description ?? "").trim(), input.useGlobalConditions ? 1 : 0]
    );
    await insertChildren(conn, res.insertId, input);
    await touchProject(conn, projectCode);
    return res.insertId;
  });
}

/** Sửa mã hàng: cập nhật thông tin, thay toàn bộ điều kiện riêng + tham số. false = không còn mã hàng này. */
export async function updateRecipe(projectCode: string, recipeId: number, input: RecipeInput): Promise<boolean> {
  return inTransaction(async (conn) => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM dnc_recipe WHERE id = ? AND project_code = ? FOR UPDATE",
      [recipeId, projectCode]
    );
    if (rows.length === 0) return false;
    await conn.execute(
      "UPDATE dnc_recipe SET mahang = ?, description = ?, use_global_conditions = ? WHERE id = ?",
      [input.mahang.trim(), (input.description ?? "").trim(), input.useGlobalConditions ? 1 : 0, recipeId]
    );
    await conn.execute("DELETE FROM dnc_recipe_condition WHERE recipe_id = ?", [recipeId]);
    await conn.execute("DELETE FROM dnc_recipe_param WHERE recipe_id = ?", [recipeId]);
    await insertChildren(conn, recipeId, input);
    await touchProject(conn, projectCode);
    return true;
  });
}

/** Xóa mã hàng (điều kiện riêng + tham số tự xóa theo - ON DELETE CASCADE). false = không còn mã hàng này. */
export async function deleteRecipe(projectCode: string, recipeId: number): Promise<boolean> {
  return inTransaction(async (conn) => {
    const [res] = await conn.execute<ResultSetHeader>("DELETE FROM dnc_recipe WHERE id = ? AND project_code = ?", [recipeId, projectCode]);
    if (res.affectedRows > 0) await touchProject(conn, projectCode);
    return res.affectedRows > 0;
  });
}