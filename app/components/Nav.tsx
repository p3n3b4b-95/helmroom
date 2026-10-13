"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export default function Nav() {
  const [user, setUser] = useState<{ name: string; email: string } | null | undefined>(undefined);
  const router = useRouter();
  useEffect(() => {
    api<{ user: { name: string; email: string } | null }>("/api/me").then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  const link = "rounded-md px-2 py-2 text-sm font-medium text-text-muted hover:bg-surface sm:px-3";
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-14 max-w-[1120px] flex-wrap items-center gap-x-1 gap-y-0 px-4 py-1">
        <Link href="/" className="mr-auto py-2 text-lg font-bold">Helmroom</Link>
        <Link href="/" className={link}>Join a game</Link>
        {user ? (
          <>
            <Link href="/dashboard" className={link}>My quizzes</Link>
            <Link href="/assignments" className={link}>Sessions</Link>
            <Link href="/account" className={link}>Account</Link>
            <button className={link} onClick={async () => { await api("/api/auth/logout", { body: {} }); setUser(null); router.push("/"); }}>
              Log out
            </button>
          </>
        ) : user === null ? (
          <>
            <Link href="/login" className={link}>Log in</Link>
            <Link href="/signup" className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent">Sign up</Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
