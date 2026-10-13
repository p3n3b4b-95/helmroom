const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export const metadata = { title: "Privacy · Helmroom" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-[28px] font-bold leading-[34px]">Privacy</h1>
      <p className="text-sm text-text-muted">Last updated 2026-10-13.</p>

      <h2 className="text-xl font-semibold">What we keep</h2>
      <p><strong>Teachers:</strong> your email address, your name if you gave one, a scrambled form of your password (never the password itself), your quizzes, and the games you have run with their results.</p>
      <p><strong>Students:</strong> the display name they type to join a game, their answers, their score and the time each answer took, for that game only. Students have no account and we don&apos;t ask for an email, a surname or a date of birth. Please tell students to use a first name or a nickname.</p>

      <h2 className="text-xl font-semibold">Cookies</h2>
      <p>We set a sign-in cookie for teachers, and a random token in a cookie for a student to stay in the game they joined. Both are needed for the app to work. We use no advertising or analytics cookies and no third-party trackers.</p>

      <h2 className="text-xl font-semibold">Who handles the data</h2>
      <p>Helmroom runs on a hosting provider and a database provider, and they process the data above on our behalf. We don&apos;t sell data and we don&apos;t share it for advertising.</p>

      <h2 className="text-xl font-semibold">Deleting data</h2>
      <p>Teachers can delete their account from the <a className="text-accent underline" href="/account">account page</a>. That removes the account, every quiz, every game and every student result tied to it. Deleting a single quiz does not remove the results of games already played from it. Game results are otherwise kept until the account is deleted.</p>

      <h2 className="text-xl font-semibold">Schools and students</h2>
      <p>Helmroom is made for teachers to use with their classes. Teachers are responsible for using it in line with their school&apos;s rules and the law where they teach.</p>

      {email && (<><h2 className="text-xl font-semibold">Questions</h2><p>Write to <a className="text-accent underline" href={`mailto:${email}`}>{email}</a>.</p></>)}
    </article>
  );
}
