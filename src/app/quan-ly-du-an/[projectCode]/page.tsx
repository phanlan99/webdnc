import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import ProjectDetail from "@/components/du-an/ProjectDetail";
import ProjectDetailSkeleton from "@/components/du-an/ProjectDetailSkeleton";

// Trang chi tiết dự án: /quan-ly-du-an/REMAINBAR (#ma-hang | #dieu-kien-chung | #canh-bao)
export default function ProjectDetailPage({ params }: { params: Promise<{ projectCode: string }> }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        {/* Chiếm toàn bộ phần bên phải sidebar. Phần đọc Database hiển thị sau; trong lúc chờ hiện khung tải cùng bố cục */}
        <Suspense fallback={<ProjectDetailSkeleton />}>
          <ProjectDetail params={params} />
        </Suspense>
      </main>
    </div>
  );
}