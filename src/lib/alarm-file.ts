// ====================================================
// FILE CSV / EXCEL CẤU HÌNH CẢNH BÁO / LỖI CỦA 1 DỰ ÁN
// Dùng chung trình duyệt (xem trước CSV) và server (kiểm tra lại trước khi ghi Database).
//
// Mỗi dòng có cột "Loai":
//   CANHBAO : 1 cảnh báo / lỗi -> Nhom, Ma, Bat, MucDo, Nguon, DiaChi, Kieu, SoSanh, GiaTri, DoDai, BaoXuLy,
//                                 NoiDungVI, NoiDungEN, CachXuLy, GhiChu
//   GUIKEM  : thanh ghi gửi kèm -> Nhom, Ma (của cảnh báo), Nguon, DiaChi, Kieu, DoDai, TenGuiKem
// Nhom : PLC1 (PLC chính), PLC2, PLC3..., FANUC     | MucDo: LOI / CANHBAO (hoặc ERROR / WARNING)
// Nguon: PLC (nhóm PLC) | PMC / MACRO (nhóm FANUC)
// Nhập file: chỉ THAY các nhóm có trong file, nhóm khác giữ nguyên.
// ====================================================

import { alarmGroupTargets, validateAlarm, type AlarmInput } from "@/lib/alarm-rules";
import { csvKey, stripApostrophe, toBool, toOperator, toTarget, toType, toValue } from "@/lib/recipe-csv";

export const ALARM_COLUMNS = [
  "Loai", "Nhom", "Ma", "Bat", "MucDo", "Nguon", "DiaChi", "Kieu", "SoSanh", "GiaTri", "DoDai", "BaoXuLy",
  "NoiDungVI", "NoiDungEN", "CachXuLy", "GhiChu", "TenGuiKem",
] as const;
type Column = (typeof ALARM_COLUMNS)[number];

export const ROW_ALARM = "CANHBAO";
export const ROW_ATTACH = "GUIKEM";
export const ALARM_SHEET = "CanhBao";
export const ALARM_TEXT_COLUMNS: Column[] = ["Ma", "DiaChi", "NoiDungVI", "NoiDungEN", "CachXuLy", "GhiChu", "TenGuiKem"];

export type AlarmFileGroup = { key: string; alarms: AlarmInput[] };

// ---------------------------------------------------------------- GHI
/** Bảng dữ liệu (dòng 1 là tiêu đề) - dùng để tạo cả CSV lẫn Excel. */
export function alarmRows(groups: AlarmFileGroup[]): Record<Column, string>[] {
  const rows: Record<Column, string>[] = [];
  const empty = () => Object.fromEntries(ALARM_COLUMNS.map((c) => [c, ""])) as Record<Column, string>;
  for (const g of groups) {
    for (const a of g.alarms) {
      rows.push({
        ...empty(), Loai: ROW_ALARM, Nhom: g.key, Ma: a.code, Bat: a.enabled ? "1" : "0", MucDo: a.level === "WARNING" ? "CANHBAO" : "LOI",
        Nguon: a.target, DiaChi: a.address, Kieu: a.dataType, SoSanh: a.operator, GiaTri: a.value, DoDai: String(a.length),
        BaoXuLy: a.reportResolved ? "1" : "0", NoiDungVI: a.messageVi, NoiDungEN: a.messageEn, CachXuLy: a.solution, GhiChu: a.note,
      });
      for (const t of a.attachments) {
        rows.push({
          ...empty(), Loai: ROW_ATTACH, Nhom: g.key, Ma: a.code, Nguon: t.target, DiaChi: t.address, Kieu: t.dataType,
          DoDai: String(t.length), TenGuiKem: t.name,
        });
      }
    }
  }
  return rows;
}

function cell(value: string, column: Column): string {
  let v = value ?? "";
  if (ALARM_TEXT_COLUMNS.includes(column) && /^[=+\-@]/.test(v)) v = "'" + v; // chống Excel hiểu nhầm thành công thức
  return /[",\r\n;]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Nội dung CSV (có BOM để Excel đọc đúng tiếng Việt). */
export function buildAlarmsCsv(groups: AlarmFileGroup[]): string {
  const lines = [ALARM_COLUMNS.join(",")];
  for (const r of alarmRows(groups)) lines.push(ALARM_COLUMNS.map((c) => cell(r[c], c)).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- ĐỌC
export type AlarmFileIssue = { line?: number; message: string };

export type AlarmImportResult = {
  groups: AlarmFileGroup[];
  issues: AlarmFileIssue[];
  stats: { groups: number; alarms: number; errors: number; warnings: number; attachments: number };
};

function toGroup(v: string): string {
  const k = csvKey(v);
  if (k === "PLC" || k === "PLC1" || k === "PLCCHINH" || k === "PLC1CHINH") return "PLC1";
  if (k === "FANUC" || k === "CNC") return "FANUC";
  return k;
}

function toLevel(v: string): string | null {
  const k = csvKey(v);
  if (["LOI", "ERROR", "ERR", "E"].includes(k)) return "ERROR";
  if (["CANHBAO", "WARNING", "WARN", "W"].includes(k)) return "WARNING";
  return null;
}

/** Đọc bảng (CSV hoặc Excel) thành cấu hình cảnh báo + kiểm tra theo quy tắc. Không ném lỗi. */
export function readAlarmRows(rows: string[][]): AlarmImportResult {
  const issues: AlarmFileIssue[] = [];
  const result: AlarmImportResult = { groups: [], issues, stats: { groups: 0, alarms: 0, errors: 0, warnings: 0, attachments: 0 } };
  if (rows.length === 0) {
    issues.push({ message: "File trống." });
    return result;
  }

  const header = rows[0].map(csvKey);
  const pos = {} as Record<Column, number>;
  for (const c of ALARM_COLUMNS) pos[c] = header.indexOf(csvKey(c));
  const missing = (["Loai", "Nhom", "Ma"] as Column[]).filter((c) => pos[c] < 0);
  if (missing.length > 0) {
    issues.push({ line: 1, message: `Thiếu cột ${missing.join(", ")} ở dòng tiêu đề. Hãy dùng file xuất từ trang này làm mẫu.` });
    return result;
  }
  const get = (r: string[], c: Column) => (pos[c] >= 0 ? (r[pos[c]] ?? "") : "");

  const groups = new Map<string, Map<string, AlarmInput>>();          // nhóm -> mã -> cảnh báo
  const pendingAttach: { line: number; group: string; code: string; row: string[] }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    if (r.every((v) => v.trim() === "") || r[0]?.trim().startsWith("#")) continue;

    const type = csvKey(get(r, "Loai"));
    const group = toGroup(get(r, "Nhom"));
    const code = stripApostrophe(get(r, "Ma")).trim().toUpperCase();
    if (type !== ROW_ALARM && type !== ROW_ATTACH && type !== "ALARM" && type !== "ATTACH") {
      issues.push({ line, message: `Cột Loai "${get(r, "Loai")}" không hợp lệ (CANHBAO hoặc GUIKEM).` });
      continue;
    }
    if (!alarmGroupTargets(group)) {
      issues.push({ line, message: `Nhóm "${get(r, "Nhom")}" không hợp lệ (PLC1, PLC2..., FANUC).` });
      continue;
    }
    if (!code) {
      issues.push({ line, message: "Thiếu mã cảnh báo (cột Ma)." });
      continue;
    }

    if (type === ROW_ATTACH || type === "ATTACH") {
      pendingAttach.push({ line, group, code, row: r });
      continue;
    }

    const list = groups.get(group) ?? new Map<string, AlarmInput>();
    groups.set(group, list);
    if (list.has(code)) {
      issues.push({ line, message: `Mã ${code} bị khai báo 2 lần trong nhóm ${group}.` });
      continue;
    }
    const level = toLevel(get(r, "MucDo"));
    if (!level) issues.push({ line, message: `Mức độ "${get(r, "MucDo")}" không hợp lệ (LOI hoặc CANHBAO).` });
    const dataType = toType(get(r, "Kieu"));
    const defaultTarget = group === "FANUC" ? "PMC" : "PLC";
    list.set(code, {
      enabled: toBool(get(r, "Bat"), true), code, level: level ?? "ERROR",
      target: get(r, "Nguon").trim() ? toTarget(get(r, "Nguon")) : defaultTarget,
      address: get(r, "DiaChi").trim(), dataType, operator: toOperator(get(r, "SoSanh")), value: toValue(get(r, "GiaTri"), dataType),
      length: Number(get(r, "DoDai").trim() || 10), reportResolved: toBool(get(r, "BaoXuLy"), true),
      messageVi: stripApostrophe(get(r, "NoiDungVI")).trim(), messageEn: stripApostrophe(get(r, "NoiDungEN")).trim(),
      solution: stripApostrophe(get(r, "CachXuLy")).trim(), note: stripApostrophe(get(r, "GhiChu")).trim(), attachments: [],
    });
  }

  // Gắn thanh ghi gửi kèm vào đúng cảnh báo (dòng GUIKEM đứng trước hay sau dòng CANHBAO đều được)
  for (const p of pendingAttach) {
    const alarm = groups.get(p.group)?.get(p.code);
    if (!alarm) {
      issues.push({ line: p.line, message: `Gửi kèm cho mã ${p.code} (nhóm ${p.group}) nhưng không có dòng CANHBAO của mã này.` });
      continue;
    }
    const r = p.row;
    alarm.attachments.push({
      target: get(r, "Nguon").trim() ? toTarget(get(r, "Nguon")) : (p.group === "FANUC" ? "PMC" : "PLC"),
      address: get(r, "DiaChi").trim(), dataType: toType(get(r, "Kieu")), length: Number(get(r, "DoDai").trim() || 10),
      name: stripApostrophe(get(r, "TenGuiKem")).trim(),
    });
  }

  // Kiểm tra từng cảnh báo theo đúng quy tắc khi thêm / sửa trên web
  for (const [key, list] of groups) {
    const targets = alarmGroupTargets(key)!;
    const alarms = [...list.values()];
    for (const a of alarms) {
      const others = alarms.filter((x) => x !== a).map((x) => x.code);
      for (const e of validateAlarm(a, targets, others)) issues.push({ message: `Nhóm ${key}, mã ${a.code} — ${e.message}` });
    }
    result.groups.push({ key, alarms });
  }
  result.groups.sort((a, b) => groupOrder(a.key) - groupOrder(b.key));

  const all = result.groups.flatMap((g) => g.alarms);
  result.stats = {
    groups: result.groups.length,
    alarms: all.length,
    errors: all.filter((a) => a.level === "ERROR").length,
    warnings: all.filter((a) => a.level === "WARNING").length,
    attachments: all.reduce((s, a) => s + a.attachments.length, 0),
  };
  return result;
}

function groupOrder(key: string): number {
  return key === "FANUC" ? 1000 : Number(key.slice(3));
}