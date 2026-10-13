import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Helmroom",
  description: "Quizzes where the teacher sets the rules. Run them live or as homework.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
