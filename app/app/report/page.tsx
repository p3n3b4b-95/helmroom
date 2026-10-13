"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { csvCell, rpc, teacherClient, usePoll } from "@/lib/client";
import { Button, Card, ErrorText } from "@/components/ui";

type Report = {
  session: { id: string; title: string; kind: string; status: string; code: string; total: number };
  students: { name: string; score: number; attempt: number; answered: number; correct: number; finished: boolean }[];
  questions: {
    index: number; type: string; prompt: string; options: string[]; correct: (number | string)[];
    answered: number; correct_pct: number | null; avg_time_s: number | null; counts: number[]; texts: string[];
  }[];
};

function downloadCsv(r: Report) {
  const rows = [["Student", "Score", "Correct", "Answered", "Total questions"],
    ...r.students.map((x) => [x.name, x.score, x.correct, x.answered, r.session.total])];
  const blob = new Blob([rows.map((l) => l.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "results.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function ReportPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { data, error } = usePoll<Report>(`report:${id}`, () => rpc<Report>(teacherClient(), "session_report", { p_id: id }), 5000);
  useEffect(() => { if (error?.status === 401) router.replace("/login/"); }, [error, router]);

  if (error && !data) return <ErrorText>{error.message}</ErrorText>;
  if (!data) return <p className="text-text-muted">Loading…</p>;
  const { session: s, students, questions } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold leading-[34px]">{s.title}: results</h1>
        <Link href={`/host/?id=${s.id}`}><Button variant="secondary">Back to game</Button></Link>
        <Button onClick={() => downloadCsv(data)}>Download CSV</Button>
      </div>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-xl font-semibold">Students ({students.length})</h2>
        {students.length === 0 ? <p className="text-text-muted">Nobody played yet.</p> : (
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4">Name</th><th className="pr-4">Score</th><th className="pr-4">Correct</th><th className="pr-4">Answered</th><th>Status</th>
            </tr></thead>
            <tbody>
              {students.map((x) => (
                <tr key={x.name} className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">{x.name}</td><td className="pr-4">{x.score}</td>
                  <td className="pr-4">{x.correct}</td><td className="pr-4">{x.answered}/{s.total}</td>
                  <td>{x.finished ? "Finished" : "In progress"}{x.attempt > 1 ? ` · attempt ${x.attempt}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Questions</h2>
        {questions.map((q) => (
          <Card key={q.index} className="space-y-2">
            <p className="font-semibold">{q.index + 1}. {q.prompt}</p>
            <p className="text-sm text-text-muted">
              {q.answered} answered
              {q.correct_pct !== null ? ` · ${q.correct_pct}% correct` : ""}
              {q.avg_time_s !== null ? ` · avg ${q.avg_time_s}s` : ""}
            </p>
            {q.options.length > 0 && (
              <ul className="text-sm">
                {q.options.map((o, k) => (
                  <li key={k} className="flex justify-between border-t border-border py-1">
                    <span>{o}{(q.correct as number[]).includes(k) ? " ✓" : ""}</span><span>{q.counts[k]}</span>
                  </li>
                ))}
              </ul>
            )}
            {q.texts.length > 0 && (
              <ul className="space-y-1 text-sm">{q.texts.map((t, i) => <li key={i} className="rounded-md bg-surface px-3 py-1">{t}</li>)}</ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="text-text-muted">Loading…</p>}><ReportPage /></Suspense>;
}
