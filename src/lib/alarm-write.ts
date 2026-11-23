import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDb, query } from "@/lib/db";
import { normalizeAddress } from "@/lib/recipe-rules";
import type { AlarmInput } from "@/lib/alarm-rules";
import { resolveAlarmGroup } from "@/lib/alarms";
import type { AlarmFileGroup } from "@/lib/alarm-file";

// ====================================================
// GHI CẤU HÌNH CẢNH BÁO / LỖI (thêm / sửa / xóa) - mỗi thao tác là 1 transaction
// ====================================================

const WEB_MACHINE = "WEB";
type Group = NonNullable<ReturnType<typeof resolveAlarmGroup>>;

async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getDb().getConnection();
  try {
    await conn.beginTransaction();
    const r = await work(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Mã các cảnh báo khác trong nhóm (để kiểm tra trùng mã). */
export async function getOtherAlarmCodes(g: Group, exceptId: number | null): Promise<string[]> {
  const rows = await query<{ alarm_code: string; id: number }>(`SELECT id, alarm_code FROM ${g.tables.alarm} WHERE project_code = ?`, [g.projectKey]);
  return rows.filter((r) => r.id !== exceptId).map((r) => r.alarm_code);
}

function alarmValues(g: Group, a: AlarmInput) {
  return {
    cols: "enabled, alarm_code, level, address, data_type, compare_op, compare_value, str_length, report_resolved, message_vi, message_en, solution, note, updated_by_machine" +
      (g.tables.hasTarget ? ", target_kind" : ""),
    values: [
      a.enabled ? 1 : 0, a.code.trim().toUpperCase(), a.level, normalizeAddress(a.target, a.address), a.dataType, a.operator, a.value ?? "",
      a.length, a.reportResolved ? 1 : 0, (a.messageVi ?? "").trim(), (a.messageEn ?? "").trim(), (a.solution ?? "").trim(),
      (a.note ?? "").trim(), WEB_MACHINE, ...(g.tables.hasTarget ? [a.target] : []),
    ],
  };
}

async function writeAttachments(conn: PoolConnection, g: Group, alarmId: number, a: AlarmInput) {
  await conn.execute(`DELETE FROM ${g.tables.attach} WHERE alarm_id = ?`, [alarmId]);
  for (const [i, t] of a.attachments.entries()) {
    await conn.execute(
      `INSERT INTO ${g.tables.attach} (alarm_id, sort_order, address, data_type, str_length, name${g.tables.hasTarget ? ", target_kind" : ""})
       VALUES (?, ?, ?, ?, ?, ?${g.tables.hasTarget ? ", ?" : ""})`,
      [alarmId, i, normalizeAddress(t.target, t.address), t.dataType, t.length, (t.name ?? "").trim(), ...(g.tables.hasTarget ? [t.target] : [])]
    );
  }
}

/** Thêm cảnh báo mới vào cuối danh sách của nhóm. */
export async function createAlarm(g: Group, a: AlarmInput): Promise<number> {
  return inTransaction(async (conn) => {
    const [mx] = await conn.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${g.tables.alarm} WHERE project_code = ?`, [g.projectKey]);
    const { cols, values } = alarmValues(g, a);
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO ${g.tables.alarm} (project_code, sort_order, ${cols}) VALUES (?, ?, ${values.map(() => "?").join(", ")})`,
      [g.projectKey, Number(mx[0].n), ...values]
    );
    await writeAttachments(conn, g, res.insertId, a);
    return res.insertId;
  });
}

/** Sửa cảnh báo (thay luôn danh sách gửi kèm). false = không còn cảnh báo này. */
export async function updateAlarm(g: Group, id: number, a: AlarmInput): Promise<boolean> {
  return inTransaction(async (conn) => {
    const [found] = await conn.execute<RowDataPacket[]>(`SELECT id FROM ${g.tables.alarm} WHERE id = ? AND project_code = ? FOR UPDATE`, [id, g.projectKey]);
    if (found.length === 0) return false;
    const { cols, values } = alarmValues(g, a);
    const sets = cols.split(", ").map((c) => `${c} = ?`).join(", ");
    await conn.execute(`UPDATE ${g.tables.alarm} SET ${sets} WHERE id = ?`, [...values, id]);
    await writeAttachments(conn, g, id, a);
    return true;
  });
}

/** Xóa cảnh báo (thanh ghi gửi kèm tự xóa theo - ON DELETE CASCADE). Lịch sử cảnh báo vẫn giữ. */
export async function deleteAlarm(g: Group, id: number): Promise<boolean> {
  const [res] = await getDb().execute<ResultSetHeader>(`DELETE FROM ${g.tables.alarm} WHERE id = ? AND project_code = ?`, [id, g.projectKey]);
  return res.affectedRows > 0;
}

/** Đổi thứ tự: đổi chỗ cảnh báo với cảnh báo ngay trên / dưới. */
export async function moveAlarm(g: Group, id: number, direction: -1 | 1): Promise<boolean> {
  return inTransaction(async (conn) => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM ${g.tables.alarm} WHERE project_code = ? ORDER BY sort_order, id FOR UPDATE`, [g.projectKey]);
    const ids = rows.map((r) => Number(r.id));
    const i = ids.indexOf(id), j = i + direction;
    if (i < 0) return false;
    if (j < 0 || j >= ids.length) return true;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [order, alarmId] of ids.entries()) await conn.execute(`UPDATE ${g.tables.alarm} SET sort_order = ? WHERE id = ?`, [order, alarmId]);
    return true;
  });
}

/**
 * NHẬP FILE: thay TOÀN BỘ cảnh báo của các nhóm có trong file (nhóm khác giữ nguyên). 1 transaction.
 * Lịch sử cảnh báo không bị ảnh hưởng.
 */
export async function replaceAlarmGroups(projectCode: string, groups: AlarmFileGroup[]): Promise<void> {
  await inTransaction(async (conn) => {
    for (const fg of groups) {
      const g = resolveAlarmGroup(projectCode, fg.key);
      if (!g) throw new Error(`Nhóm ${fg.key} không hợp lệ`);
      await conn.execute(`DELETE FROM ${g.tables.alarm} WHERE project_code = ?`, [g.projectKey]); // CASCADE: gửi kèm
      for (const [order, a] of fg.alarms.entries()) {
        const { cols, values } = alarmValues(g, a);
        const [res] = await conn.execute<ResultSetHeader>(
          `INSERT INTO ${g.tables.alarm} (project_code, sort_order, ${cols}) VALUES (?, ?, ${values.map(() => "?").join(", ")})`,
          [g.projectKey, order, ...values]
        );
        await writeAttachments(conn, g, res.insertId, a);
      }
    }
  });
}