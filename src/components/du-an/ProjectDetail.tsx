import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { getProjectDetail } from "@/lib/recipes";
import { getProjectTargets } from "@/lib/recipe-write";
import { getProjectAlarms } from "@/lib/alarms";
import GlobalConditionSection from "./GlobalConditionSection";
import RecipeBrowser from "./RecipeBrowser";
import AlarmManager from "./AlarmManager";
import ProjectTabs from "./ProjectTabs";
import RefreshButton from "./RefreshButton";

// ====================================================
// CHI TIẾT 1 DỰ ÁN (Server Component - đọc Database trực tiếp, không cần api/)
//   Tên dự án -> 4 thẻ số liệu -> 3 tab: Mã hàng | Điều kiện chung | Cảnh báo / Lỗi
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
  const targets = await getProjectTargets(p.projectCode);     // thiết bị dùng được khi thêm / sửa
  const canEdit = process.env.DNC_WEB_ALLOW_EDIT === "true";   // công tắc an toàn trong .env.local
  const alarmResult = await getProjectAlarms(p.projectCode);   // cảnh báo / lỗi (PLC1, PLC2..., FANUC)

  // Số liệu cho các thẻ
  const allParams = p.recipes.flatMap((r) => r.params);
  const allAlarms = alarmResult.ok ? alarmResult.groups.flatMap((g) => g.alarms) : [];
  const alarmErrors = allAlarms.filter((a) => a.level === "ERROR").length;

  return (
    <div className="space-y-6">
      {/* ---------- Tên dự án ---------- */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-2xl font-bold text-slate-800 md:text-3xl" title={p.projectCode}>
          {p.projectName || p.projectCode}
        </h1>
        <RefreshButton />
      </div>

      {/* ---------- Thẻ số liệu chính ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard tone="blue" icon={<BoxIcon />} label="Mã hàng" value={p.recipes.length}
          sub={`${p.recipes.filter((r) => r.useGlobalConditions).length} mã dùng điều kiện chung`} />
        <StatCard tone="violet" icon={<SendIcon />} label="Tham số gửi" value={allParams.length}
          sub={`${allParams.filter((x) => x.enabled).length} đang bật`} />
        <StatCard tone="emerald" icon={<CheckIcon />} label="Điều kiện chung" value={p.globalConditions.length}
          sub={`${p.globalConditions.filter((c) => c.enabled).length} đang bật`} />
        <StatCard tone="rose" icon={<AlertIcon />} label="Cảnh báo / Lỗi" value={allAlarms.length}
          sub={`${alarmErrors} lỗi • ${allAlarms.length - alarmErrors} cảnh báo`} />
      </div>

      {/* ---------- Tab ---------- */}
      <ProjectTabs
        tabs={[
          {
            key: "ma-hang", label: "Mã hàng", hint: "Tham số gửi xuống FANUC / PLC, điều kiện riêng",
            icon: <BoxIcon />, badge: p.recipes.length, tone: "blue",
            content: (
              <Panel title="Mã hàng" description="Bấm vào 1 mã hàng để xem tham số gửi và điều kiện riêng.">
                <RecipeBrowser projectCode={p.projectCode} recipes={p.recipes} targets={targets} canEdit={canEdit} />
              </Panel>
            ),
          },
          {
            key: "dieu-kien-chung", label: "Điều kiện chung", hint: "Phải đạt hết mới gửi dữ liệu mã hàng",
            icon: <CheckIcon />, badge: p.globalConditions.length, tone: "emerald",
            content: <GlobalConditionSection projectCode={p.projectCode} conditions={p.globalConditions} targets={targets} canEdit={canEdit} />,
          },
          {
            key: "canh-bao", label: "Cảnh báo / Lỗi", hint: "Cấu hình giám sát lỗi PLC / FANUC",
            icon: <AlertIcon />, badge: allAlarms.length, tone: "rose",
            content: (
              <Panel title="Cảnh báo / Lỗi" description="Phát sinh khi điều kiện chuyển SAI → ĐÚNG; chọn nhóm PLC / FANUC để xem và chỉnh.">
                <AlarmManager projectCode={p.projectCode} groups={alarmResult.ok ? alarmResult.groups : []} canEdit={canEdit}
                  loadError={alarmResult.ok ? undefined : alarmResult.error} />
              </Panel>
            ),
          },
        ]}
      />
    </div>
  );
}

// ---------------- Thành phần giao diện ----------------
const STAT_TONES = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
};

function StatCard({ tone, icon, label, value, sub }: { tone: keyof typeof STAT_TONES; icon: ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex size-9 items-center justify-center rounded-xl ${STAT_TONES[tone]}`}>{icon}</span>
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-800">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18m8-13.5-8 4.5-8-4.5" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12 20 4l-6 16-3-7-7-1Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}