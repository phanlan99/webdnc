import Sidebar from "@/components/Sidebar";
import TrangChu from "@/components/TrangChu";

export default function HomePage() {
  return (
    // Mobile: thanh menu ở trên, nội dung bên dưới | Máy tính: sidebar bên trái, nội dung bên phải
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <TrangChu />
    </div>
  );
}