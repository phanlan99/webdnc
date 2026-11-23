import "server-only";
import { describeDbError, query } from "@/lib/db";
import { getProjectTargets } from "@/lib/recipe-write";
import { alarmGroupTargets } from "@/lib/alarm-rules";

// ====================================================
// ĐỌC CẤU HÌNH CẢNH BÁO / LỖI CỦA 1 DỰ ÁN (bảng do app C# DNC tạo)
//   PLC1         : dnc_plc_alarm   (+ _attach)      project_code = <dự án>
//   PLC2, PLC3.. : dnc_plc_alarm   (+ _attach)      project_code = <dự án>.PLC2 ...
//   FANUC        : dnc_fanuc_alarm (+ _attach)      project_code = <dự án>, có cột target_kind (PMC / MACRO)
// ====================================================

export type AlarmAttach = { id: number; target: string; address: string; dataType: string; length: number; name: string };

export type Alarm = {
  id: number;
  enabled: boolean;
  code: string;
  level: string;
  target: string;
  address: string;
  dataType: string;
  operator: string;
  value: string;
  length: number;
  reportResolved: boolean;
  messageVi: string;
  messageEn: string;
  solution: string;
  note: string;
  updatedAt: string | null;
  updatedBy: string;
  attachments: AlarmAttach[];
};

export type AlarmGroup = {
  key: string;          // "PLC1" | "PLC2" ... | "FANUC"
  label: string;
  targets: string[];    // nguồn dùng được trong nhóm
  alarms: Alarm[];
};

export type ProjectAlarmsResult = { ok: true; groups: AlarmGroup[] } | { ok: false; error: string };

// Tên bảng cố định (không lấy từ người dùng -> không thể chèn SQL)
export const ALARM_TABLES = {
  PLC: { alarm: "dnc_plc_alarm", attach: "dnc_plc_alarm_attach", hasTarget: false },
  FANUC: { alarm: "dnc_fanuc_alarm", attach: "dnc_fanuc_alarm_attach", hasTarget: true },
} as const;

/** Nhóm cảnh báo -> bảng + khóa dự án lưu trong Database. null = mã nhóm không hợp lệ. */
export function resolveAlarmGroup(projectCode: string, groupKey: string) {
  const g = (groupKey ?? "").toUpperCase();
  const targets = alarmGroupTargets(g);
  if (!targets) return null;
  if (g === "FANUC") return { tables: ALARM_TABLES.FANUC, projectKey: projectCode, targets, isFanuc: true };
  return { tables: ALARM_TABLES.PLC, projectKey: g === "PLC1" ? projectCode : `${projectCode}.${g}`, targets, isFanuc: false };
}

type AlarmRow = {
  id: number; project_code: string; enabled: number; alarm_code: string; level: string; target_kind?: string; address: string; data_type: string;
  compare_op: string; compare_value: string; str_length: number; report_resolved: number; message_vi: string; message_en: string;
  solution: string; note: string; updated_at: string | null; updated_by_machine: string;
};
type AttachRow = { id: number; alarm_id: number; target_kind?: string; address: string; data_type: string; str_length: number; name: string };

async function loadTable(table: "PLC" | "FANUC", projectKeys: string[]): Promise<Map<string, Alarm[]>> {
  const t = ALARM_TABLES[table];
  const result = new Map<string, Alarm[]>();
  if (projectKeys.length === 0) return result;
  const marks = projectKeys.map(() => "?").join(",");
  const rows = await query<AlarmRow>(`SELECT * FROM ${t.alarm} WHERE project_code IN (${marks}) ORDER BY project_code, sort_order, id`, projectKeys);
  const attachRows = await query<AttachRow>(
    `SELECT a.* FROM ${t.attach} a JOIN ${t.alarm} m ON m.id = a.alarm_id WHERE m.project_code IN (${marks}) ORDER BY a.alarm_id, a.sort_order, a.id`,
    projectKeys
  );
  const byAlarm = new Map<number, AlarmAttach[]>();
  for (const a of attachRows) {
    const list = byAlarm.get(a.alarm_id) ?? [];
    list.push({
      id: a.id, target: t.hasTarget ? (a.target_kind || "PMC").toUpperCase() : "PLC", address: a.address,
      dataType: a.data_type, length: a.str_length, name: a.name,
    });
    byAlarm.set(a.alarm_id, list);
  }
  for (const r of rows) {
    const list = result.get(r.project_code.toUpperCase()) ?? [];
    list.push({
      id: r.id, enabled: Number(r.enabled) !== 0, code: r.alarm_code, level: (r.level || "ERROR").toUpperCase(),
      target: t.hasTarget ? (r.target_kind || "PMC").toUpperCase() : "PLC", address: r.address, dataType: r.data_type,
      operator: (r.compare_op || "EQ").toUpperCase(), value: r.compare_value, length: r.str_length, reportResolved: Number(r.report_resolved) !== 0,
      messageVi: r.message_vi, messageEn: r.message_en, solution: r.solution, note: r.note, updatedAt: r.updated_at,
      updatedBy: r.updated_by_machine, attachments: byAlarm.get(r.id) ?? [],
    });
    result.set(r.project_code.toUpperCase(), list);
  }
  return result;
}

/** Toàn bộ cấu hình cảnh báo của dự án, chia theo nhóm PLC1 / PLC2... / FANUC. */
export async function getProjectAlarms(projectCode: string): Promise<ProjectAlarmsResult> {
  try {
    // Các PLC mở rộng: theo danh sách PLC của dự án + nhóm đã có cảnh báo trong Database
    const plcCodes = new Set<string>((await getProjectTargets(projectCode)).filter((t) => t.startsWith("PLC:")).map((t) => t.slice(4)));
    const existing = await query<{ k: string }>(
      "SELECT DISTINCT UPPER(project_code) AS k FROM dnc_plc_alarm WHERE project_code LIKE ?",
      [`${projectCode}.PLC%`]
    ).catch(() => []);
    existing.forEach((e) => plcCodes.add(e.k.slice(projectCode.length + 1)));
    const extra = [...plcCodes].filter((c) => /^PLC\d+$/.test(c) && c !== "PLC1").sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));

    const plcKeys = [projectCode, ...extra.map((c) => `${projectCode}.${c}`)];
    const plc = await loadTable("PLC", plcKeys);
    const fanuc = await loadTable("FANUC", [projectCode]);

    return {
      ok: true,
      groups: [
        { key: "PLC1", label: extra.length ? "PLC1 (chính)" : "PLC", targets: ["PLC"], alarms: plc.get(projectCode.toUpperCase()) ?? [] },
        ...extra.map((c) => ({ key: c, label: c, targets: ["PLC"], alarms: plc.get(`${projectCode}.${c}`.toUpperCase()) ?? [] })),
        { key: "FANUC", label: "FANUC", targets: ["PMC", "MACRO"], alarms: fanuc.get(projectCode.toUpperCase()) ?? [] },
      ],
    };
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
}