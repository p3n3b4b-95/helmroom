"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

type QType = "mcq" | "multi" | "poll" | "fill" | "open";
type Q = {
  type: QType; prompt: string; image_url: string; options: string[]; correct: (number | string)[];
  points: number; time_limit_s: number;
};

const LABEL: Record<QType, string> = {
  mcq: "Multiple choice", multi: "Multiple answers", poll: "Poll (no right answer)",
  fill: "Fill in the blank", open: "Open-ended (not scored)",
};

const blank = (type: QType): Q => ({
  type, prompt: "", image_url: "",
  options: type === "mcq" || type === "multi" || type === "poll" ? ["", ""] : [],
  correct: [], points: 1000, time_limit_s: 20,
});

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [qs, setQs] = useState<Q[]>([blank("mcq")]);
  const [loading, setLoading] = useState(id !== "new");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === "new") return;
    api<{ title: string; subject: string; questions: (Q & { image_url: string | null })[] }>(`/api/quizzes/${id}`)
      .then((z) => {
        setTitle(z.title); setSubject(z.subject);
        setQs(z.questions.map((q) => ({ ...q, image_url: q.image_url ?? "" })));
        setLoading(false);
      })
      .catch((e) => {
        if (e.status === 401) router.replace("/login");
        else { setError(e.message); setLoading(false); }
      });
  }, [id, router]);

  const set = (i: number, patch: Partial<Q>) => setQs((a) => a.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  function toggleCorrect(i: number, o: number) {
    const q = qs[i];
    if (q.type === "mcq") return set(i, { correct: [o] });
    const has = q.correct.includes(o);
    set(i, { correct: has ? q.correct.filter((x) => x !== o) : [...q.correct, o] });
  }

  function removeOption(i: number, o: number) {
    const q = qs[i];
    set(i, {
      options: q.options.filter((_, k) => k !== o),
      correct: (q.correct as number[]).filter((c) => c !== o).map((c) => (c > o ? c - 1 : c)),
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { title, subject, questions: qs.map((q) => ({ ...q, image_url: q.image_url.trim() || null })) };
      if (id === "new") await api("/api/quizzes", { body });
      else await api(`/api/quizzes/${id}`, { method: "PUT", body });
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-[28px] font-bold leading-[34px]">{id === "new" ? "New quiz" : "Edit quiz"}</h1>
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Title"><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Subject (optional)"><Input value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} /></Field>
      </Card>

      {qs.map((q, i) => (
        <Card key={i} className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="mr-auto font-semibold">Question {i + 1} · {LABEL[q.type]}</h2>
            <Button variant="ghost" disabled={i === 0} onClick={() => setQs((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; })} aria-label="Move up">Up</Button>
            <Button variant="ghost" disabled={i === qs.length - 1} onClick={() => setQs((a) => { const b = [...a]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; return b; })} aria-label="Move down">Down</Button>
            <Button variant="ghost" disabled={qs.length === 1} onClick={() => setQs((a) => a.filter((_, j) => j !== i))}>Remove</Button>
          </div>
          <Field label="Question">
            <Input value={q.prompt} maxLength={1000} onChange={(e) => set(i, { prompt: e.target.value })} />
          </Field>
          <Field label="Image link (https, optional)">
            <Input value={q.image_url} onChange={(e) => set(i, { image_url: e.target.value })} placeholder="https://" />
          </Field>

          {q.options.length > 0 || ["mcq", "multi", "poll"].includes(q.type) ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-muted">
                Answers{q.type === "mcq" ? " (pick the right one)" : q.type === "multi" ? " (tick every right one)" : ""}
              </p>
              {q.options.map((o, k) => (
                <div key={k} className="flex items-center gap-2">
                  {q.type !== "poll" && (
                    <input type={q.type === "mcq" ? "radio" : "checkbox"} name={`c${i}`} aria-label={`Answer ${k + 1} is correct`}
                      checked={q.correct.includes(k)} onChange={() => toggleCorrect(i, k)} />
                  )}
                  <Input value={o} maxLength={200} aria-label={`Answer ${k + 1}`}
                    onChange={(e) => set(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} />
                  <Button variant="ghost" disabled={q.options.length <= 2} onClick={() => removeOption(i, k)} aria-label={`Remove answer ${k + 1}`}>×</Button>
                </div>
              ))}
              {q.options.length < 6 && (
                <Button variant="secondary" onClick={() => set(i, { options: [...q.options, ""] })}>Add answer</Button>
              )}
            </div>
          ) : null}

          {q.type === "fill" && (
            <Field label="Accepted answers (one per line, case does not matter)">
              <textarea className="min-h-20 w-full rounded-md border border-border-input p-3" value={(q.correct as string[]).join("\n")}
                onChange={(e) => set(i, { correct: e.target.value.split("\n") })} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Seconds to answer">
              <Input type="number" min={5} max={300} value={q.time_limit_s} onChange={(e) => set(i, { time_limit_s: Number(e.target.value) })} />
            </Field>
            <Field label="Points">
              <Input type="number" min={0} max={10000} step={100} value={q.points} onChange={(e) => set(i, { points: Number(e.target.value) })} />
            </Field>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABEL) as QType[]).map((t) => (
          <Button key={t} variant="secondary" onClick={() => setQs((a) => [...a, blank(t)])}>+ {LABEL[t]}</Button>
        ))}
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save quiz"}</Button>
        <Button variant="ghost" onClick={() => router.push("/dashboard")}>Cancel</Button>
      </div>
    </div>
  );
}
