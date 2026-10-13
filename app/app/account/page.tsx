"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: { email: string } | null }>("/api/me").then((r) => {
      if (!r.user) router.replace("/login");
      else setEmail(r.user.email);
    });
  }, [router]);

  async function remove() {
    setError("");
    try {
      await api("/api/me", { method: "DELETE", body: { confirm } });
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!email) return <p className="text-text-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-[28px] font-bold leading-[34px]">Account</h1>
      <p className="text-text-muted">Signed in as {email}.</p>
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Delete my account</h2>
        <p>This removes your account, all your quizzes, all your games and every student result in them. It can&apos;t be undone.</p>
        <Field label={`Type ${email} to confirm`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button variant="danger" disabled={confirm.trim().toLowerCase() !== email.toLowerCase()} onClick={remove}>
          Delete everything
        </Button>
      </Card>
    </div>
  );
}
