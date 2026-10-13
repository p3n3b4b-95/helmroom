"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePoll } from "@/lib/client";
import { Button, Card, ErrorText } from "@/components/ui";

type Row = {
  id: string; title: string; code: string; kind: "live" | "homework"; closed: boolean;
  deadline: string | null; attempts_allowed: number; players: number; created_at: string;
};

export default function Assignments() {
  const router = useRouter();
  const { data, error } = usePoll<{ sessions: Row[] }>("/api/assignments", 10000);
  useEffect(() => { if (error?.status === 401) router.replace("/login"); }, [error, router]);
  if (error && !data) return <ErrorText>{error.message}</ErrorText>;
  if (!data) return <p className="text-text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-[34px]">Sessions</h1>
      {data.sessions.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">Nothing yet</p>
          <p className="text-text-muted">Start a quiz from <Link href="/dashboard" className="text-accent underline">My quizzes</Link>.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.sessions.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto min-w-0">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-sm text-text-muted">
                    {r.kind === "homework" ? "Homework" : "Live"} · {r.players} student{r.players === 1 ? "" : "s"}
                    {r.deadline ? ` · due ${new Date(r.deadline).toLocaleString()}` : ""} · {r.closed ? "closed" : `code ${r.code}`}
                  </p>
                </div>
                <Link href={`/host/${r.id}`}><Button variant="secondary">{r.closed ? "Open" : "Manage"}</Button></Link>
                <Link href={`/report/${r.id}`}><Button>Results</Button></Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
