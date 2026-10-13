"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sessionId: string }>("/api/join", { body: { code, name } });
      router.push(`/play/${r.sessionId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-10 py-8 md:grid-cols-2 md:items-center">
      <div>
        <h1 className="text-[40px] font-bold leading-[44px]">Run the quiz your way</h1>
        <p className="mt-4 text-text-muted">
          Write a quiz, set the rules, then run it live or send it home. Students join with a code. No accounts.
        </p>
        <p className="mt-6 text-sm">
          Teaching? <Link href="/signup" className="font-semibold text-accent underline">Make a free teacher account</Link>
        </p>
      </div>
      <Card>
        <form onSubmit={join} className="space-y-4">
          <h2 className="text-xl font-semibold">Join a game</h2>
          <Field label="Game code">
            <Input inputMode="numeric" autoComplete="off" maxLength={7} placeholder="6 digits" value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} required />
          </Field>
          <Field label="Your name">
            <Input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Joining…" : "Join"}</Button>
        </form>
      </Card>
    </div>
  );
}
