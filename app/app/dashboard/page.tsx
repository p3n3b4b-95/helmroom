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

type Rules = {
  timer: "on" | "off"; extra_time: number; allow_change: boolean; shuffle_questions: boolean;
  shuffle_answers: boolean; show_correct: boolean; show_leaderboard: boolean;
};
const DEFAULT_RULES: Rules = {
  timer: "on", extra_time: 1, allow_change: true, shuffle_questions: false, shuffle_answers: false,
  show_correct: true, show_leaderboard: true,
};

function Launch({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"live" | "homework">("live");
  const [pacing, setPacing] = useState<"teacher" | "student">("teacher");
  const [deadline, setDeadline] = useState(localInput(new Date(Date.now() + 7 * 86_400_000)));
  const [attempts, setAttempts] = useState(1);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [error, setError] = useState("");
  const set = (patch: Partial<Rules>) => setRules((r) => ({ ...r, ...patch }));
  const timerChoice = rules.timer === "off" ? "off" : String(rules.extra_time);
  const box = "flex items-start gap-2 text-sm";

  async function go() {
    setError("");
    try {
      const r = await api<{ id: string }>(`/api/quizzes/${quiz.id}/sessions`, {
        body: { kind, pacing, attempts, settings: rules, deadline: kind === "homework" ? new Date(deadline).toISOString() : undefined },
      });
      router.push(`/host/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">How to run it</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "live"} onChange={() => setKind("live")} /> Live game</label>
          <label className="flex items-center gap-2"><input type="radio" checked={kind === "homework"} onChange={() => setKind("homework")} /> Homework</label>
        </div>
        {kind === "live" ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={pacing === "teacher"} onChange={() => setPacing("teacher")} /> I move the class on</label>
            <label className="flex items-center gap-2"><input type="radio" checked={pacing === "student"} onChange={() => setPacing("student")} /> Each student at their own pace</label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due"><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
            <Field label="Attempts allowed">
              <Input type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(Number(e.target.value) || 1)} />
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Time</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {[["1", "Normal"], ["1.5", "Half again as long"], ["2", "Twice as long"], ["3", "Three times as long"], ["off", "No timer"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name={`t-${quiz.id}`} checked={timerChoice === v}
                onChange={() => (v === "off" ? set({ timer: "off" }) : set({ timer: "on", extra_time: Number(v) }))} />
              {l}
            </label>
          ))}
        </div>
        {rules.timer === "off" && (
          <p className="text-sm text-text-muted">
            {kind === "live" && pacing === "teacher"
              ? "Each question stays open until you move on. Right answers earn full points."
              : "Students take as long as they need. Right answers earn full points."}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Rules</legend>
        <label className={box}><input type="checkbox" className="mt-1" checked={rules.allow_change} onChange={(e) => set({ allow_change: e.target.checked })} />
          <span>Students can change their answer
            <span className="block text-text-muted">{kind === "live" && pacing === "teacher" ? "until the question ends. They see right or wrong when it closes." : "until they lock it in."}</span></span></label>
        <label className={box}><input type="checkbox" className="mt-1" checked={rules.shuffle_questions} onChange={(e) => set({ shuffle_questions: e.target.checked })} />
          <span>Shuffle the question order
            <span className="block text-text-muted">{kind === "live" && pacing === "teacher" ? "Shuffled once, the whole class sees the same order." : "Every student gets their own order."}</span></span></label>
        <label className={box}><input type="checkbox" className="mt-1" checked={rules.shuffle_answers} onChange={(e) => set({ shuffle_answers: e.target.checked })} />
          <span>Shuffle the answers on each question</span></label>
        <label className={box}><input type="checkbox" className="mt-1" checked={rules.show_correct} onChange={(e) => set({ show_correct: e.target.checked })} />
          <span>Show students the right answer after they answer</span></label>
        <label className={box}><input type="checkbox" className="mt-1" checked={rules.show_leaderboard} onChange={(e) => set({ show_leaderboard: e.target.checked })} />
          <span>Show students the leaderboard and their rank
            <span className="block text-text-muted">You always see it.</span></span></label>
      </fieldset>

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

  async function rename(z: Quiz) {
    const title = prompt("Quiz title", z.title)?.trim();
    if (!title || title === z.title) return;
    try {
      await api(`/api/quizzes/${z.id}`, { method: "PATCH", body: { title } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function duplicate(z: Quiz) {
    try {
      await api(`/api/quizzes/${z.id}/duplicate`, { body: {} });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
          <p className="text-lg font-semibold">{q ? "Nothing matches that search" : "Nothing here yet"}</p>
          {!q && <p className="mt-1 text-text-muted">Write your first quiz. It takes a few minutes.</p>}
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
                </div>
                <div className="mt-2 flex gap-1">
                  <Button variant="ghost" onClick={() => rename(z)} aria-label={`Rename ${z.title}`}>Rename</Button>
                  <Button variant="ghost" onClick={() => duplicate(z)} aria-label={`Duplicate ${z.title}`}>Duplicate</Button>
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
