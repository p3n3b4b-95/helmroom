"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { configured, teacherClient } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNote("");
    if (!configured) return setError("This site isn't connected to its database yet.");
    if (signup && f.password.length < 8) return setError("Password needs 8 or more characters");
    setBusy(true);
    const c = teacherClient();
    const email = f.email.trim();
    const r = signup
      ? await c.auth.signUp({ email, password: f.password, options: { data: { name: f.name.trim() } } })
      : await c.auth.signInWithPassword({ email, password: f.password });
    if (r.error) {
      setError(r.error.message);
    } else if (!r.data.session) {
      setNote("Check your email for a confirmation link, then log in.");
    } else {
      router.push("/dashboard");
      return;
    }
    setBusy(false);
  }

  async function forgot() {
    setError(""); setNote("");
    if (!f.email.trim()) return setError("Type your email first, then press this again.");
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/account/`;
    const { error: e } = await teacherClient().auth.resetPasswordForEmail(f.email.trim(), { redirectTo });
    if (e) setError(e.message); else setNote("If that email has an account, a reset link is on its way.");
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-xl font-semibold">{signup ? "Create your teacher account" : "Welcome back"}</h1>
          {signup && (
            <Field label="Your name">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input type="password" minLength={signup ? 8 : undefined} value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={signup ? "new-password" : "current-password"} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          {note && <p role="status" className="text-sm text-success">{note}</p>}
          <Button type="submit" disabled={busy} className="w-full">{signup ? "Sign up" : "Log in"}</Button>
          {!signup && (
            <button type="button" onClick={forgot} className="text-sm font-semibold text-accent underline">Forgot your password?</button>
          )}
          <p className="text-sm text-text-muted">
            {signup ? "Have an account? " : "New here? "}
            <Link href={signup ? "/login" : "/signup"} className="font-semibold text-accent underline">
              {signup ? "Log in" : "Sign up"}
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
