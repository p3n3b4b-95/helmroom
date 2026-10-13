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
        <footer className="border-t border-border">
          <nav className="mx-auto flex max-w-[1120px] gap-6 px-4 py-2 text-sm text-text-muted" aria-label="Footer">
            <a href="/privacy" className="inline-block py-2 hover:underline">Privacy</a>
            <a href="/terms" className="inline-block py-2 hover:underline">Terms</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
