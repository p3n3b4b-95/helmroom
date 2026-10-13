"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rpc, teacherClient } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const c = teacherClient();
    c.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u && !u.is_anonymous) setEmail(u.email ?? "");
      else setTimeout(() => c.auth.getSession().then((r) => { if (!r.data.session) router.replace("/login/"); }), 1500);
    });
    // a password reset link signs the teacher in and lands here
    const { data } = c.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (session?.user && !session.user.is_anonymous) setEmail(session.user.email ?? "");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function setNew() {
    setError(""); setNote("");
    if (password.length < 8) return setError("Password needs 8 or more characters");
    const { error: e } = await teacherClient().auth.updateUser({ password });
    if (e) setError(e.message); else { setNote("Password changed."); setRecovering(false); setPassword(""); }
  }

  async function remove() {
    setError("");
    try {
      await rpc(teacherClient(), "account_delete", { p_confirm: confirm });
      await teacherClient().auth.signOut();
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!email) return <p className="text-text-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-[28px] font-bold leading-[34px]">Account</h1>
      <p className="text-text-muted">Signed in as {email}.</p>
      {note && <p role="status" className="text-success">{note}</p>}
      {recovering && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Choose a new password</h2>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button onClick={setNew}>Save password</Button>
        </Card>
      )}
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
