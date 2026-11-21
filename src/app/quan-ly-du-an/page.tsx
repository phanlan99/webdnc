import Sidebar from "@/components/Sidebar";

export default function ProjectsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />

      <main className="flex-1 p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Quản lý dự án</h1>
        <p className="mt-2 text-slate-500">Danh sách dự án sẽ hiển thị ở đây.</p>
      </main>
    </div>
  );
}