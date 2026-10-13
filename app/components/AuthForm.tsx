"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, { body: f });
      window.location.href = "/dashboard"; // full load so the nav picks up the session
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
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
            <Input type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={signup ? "new-password" : "current-password"} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">{signup ? "Sign up" : "Log in"}</Button>
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
