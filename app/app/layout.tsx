import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Quizroom",
  description: "Run quizzes live or as homework. Students join with a code.",
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
