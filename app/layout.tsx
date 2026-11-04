import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "LH PTB 4.0 — Premium Photo Studio",
  description: "LH PTB 4.0 — Premium Photo Studio: chụp Photo Booth, căn chỉnh Template PNG, chỉnh sửa và xuất ảnh ngay trên trình duyệt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
