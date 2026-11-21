import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import ProjectList from "@/components/du-an/ProjectList";
import ProjectListSkeleton from "@/components/du-an/ProjectListSkeleton";
import RefreshButton from "@/components/du-an/RefreshButton";

export default function ProjectsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />

      <main className="flex-1 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Quản lý dự án</h1>
            <p className="mt-1 text-slate-500">Các dự án đang quản lý trong Database DncControl.</p>
          </div>
          <RefreshButton />
        </div>

        <div className="mt-6">
          {/* Phần đọc Database hiển thị sau; trong lúc chờ hiện khung tải */}
          <Suspense fallback={<ProjectListSkeleton />}>
            <ProjectList />
          </Suspense>
        </div>
      </main>
    </div>
  );
}