import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import ProjectDetail from "@/components/du-an/ProjectDetail";
import ProjectDetailSkeleton from "@/components/du-an/ProjectDetailSkeleton";
import RefreshButton from "@/components/du-an/RefreshButton";

// Trang chi tiết dự án: /quan-ly-du-an/REMAINBAR
export default function ProjectDetailPage({ params }: { params: Promise<{ projectCode: string }> }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <div className="mb-2 flex justify-end">
          <RefreshButton />
        </div>
        {/* Phần đọc Database hiển thị sau; trong lúc chờ hiện khung tải */}
        <Suspense fallback={<ProjectDetailSkeleton />}>
          <ProjectDetail params={params} />
        </Suspense>
      </main>
    </div>
  );
}