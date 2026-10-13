import Link from "next/link";
const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export const metadata = { title: "Terms · Helmroom" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-[28px] font-bold leading-[34px]">Terms</h1>
      <p className="text-sm text-text-muted">Last updated 2026-10-13. These terms cover the beta.</p>
      <h2 className="text-xl font-semibold">Using Helmroom</h2>
      <p>Helmroom is free while it is in beta. You may use it to write quizzes and run them with your students. Don&apos;t use it to break the law, to harass anyone, or to try to get into other people&apos;s data or break the service.</p>
      <h2 className="text-xl font-semibold">Your content</h2>
      <p>Quizzes you write stay yours. You are responsible for what you put in them and for having the right to use any images you link. We may remove content that breaks these terms.</p>
      <h2 className="text-xl font-semibold">The beta</h2>
      <p>The service is provided as it is. It can change, go down or lose data, so keep a copy of anything you can&apos;t afford to lose. We may change or end the beta, and we&apos;ll give notice where we can.</p>
      <h2 className="text-xl font-semibold">Accounts</h2>
      <p>Keep your password to yourself. You can delete your account at any time from the <Link className="text-accent underline" href="/account/">account page</Link>. We may suspend accounts that misuse the service.</p>
      {email && (<><h2 className="text-xl font-semibold">Contact</h2><p><a className="text-accent underline" href={`mailto:${email}`}>{email}</a></p></>)}
    </article>
  );
}
