"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

type Quiz = { id: string; title: string; subject: string; question_count: number; updated_at: string };

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Launch({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"live" | "homework">("live");
  const [pacing, setPacing] = useState<"teacher" | "student">("teacher");
  const [deadline, setDeadline] = useState(localInput(new Date(Date.now() + 7 * 86_400_000)));
  const [attempts, setAttempts] = useState(1);
  const [error, setError] = useState("");

  async function go() {
    setError("");
    try {
      const r = await api<{ id: string }>(`/api/quizzes/${quiz.id}/sessions`, {
        body: { kind, pacing, attempts, deadline: kind === "homework" ? new Date(deadline).toISOString() : undefined },
      });
      router.push(`/host/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">How to run it</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={kind === "live"} onChange={() => setKind("live")} /> Live game</label>
        <label className="flex items-center gap-2"><input type="radio" checked={kind === "homework"} onChange={() => setKind("homework")} /> Homework</label>
      </fieldset>
      {kind === "live" ? (
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Pacing</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={pacing === "teacher"} onChange={() => setPacing("teacher")} /> I move the class on</label>
          <label className="flex items-center gap-2"><input type="radio" checked={pacing === "student"} onChange={() => setPacing("student")} /> Each student at their own pace</label>
        </fieldset>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due"><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          <Field label="Attempts allowed">
            <Input type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(Number(e.target.value) || 1)} />
          </Field>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button onClick={go}>{kind === "live" ? "Create game" : "Assign"}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [q, setQ] = useState("");
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setQuizzes((await api<{ quizzes: Quiz[] }>(`/api/quizzes?q=${encodeURIComponent(q)}`)).quizzes);
    } catch (e) {
      if ((e as { status?: number }).status === 401) router.replace("/login");
      else setError((e as Error).message);
    }
  }, [q, router]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function remove(z: Quiz) {
    if (!confirm(`Delete "${z.title}"? This cannot be undone.`)) return;
    await api(`/api/quizzes/${z.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold leading-[34px]">My quizzes</h1>
        <Input className="max-w-56" placeholder="Search" aria-label="Search quizzes" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link href="/quizzes/new"><Button>New quiz</Button></Link>
      </div>
      <ErrorText>{error}</ErrorText>
      {quizzes === null ? (
        <p className="text-text-muted">Loading…</p>
      ) : quizzes.length === 0 ? (
        <Card className="text-center">
          <p className="text-lg font-semibold">{q ? "No quiz matches that search" : "No quizzes yet"}</p>
          {!q && <p className="mt-1 text-text-muted">Make your first one, it takes a couple of minutes.</p>}
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {quizzes.map((z) => (
            <li key={z.id}>
              <Card>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold">{z.title}</h2>
                    <p className="text-sm text-text-muted">
                      {z.question_count} question{z.question_count === 1 ? "" : "s"}{z.subject ? ` · ${z.subject}` : ""}
                    </p>
                  </div>
                  <Button onClick={() => setLaunching(launching === z.id ? null : z.id)}>Start</Button>
                  <Link href={`/quizzes/${z.id}`}><Button variant="secondary">Edit</Button></Link>
                  <Button variant="ghost" onClick={() => remove(z)} aria-label={`Delete ${z.title}`}>Delete</Button>
                </div>
                {launching === z.id && <Launch quiz={z} onClose={() => setLaunching(null)} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
