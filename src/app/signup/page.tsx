import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { SideNav } from "@/components/AppChrome";

export default function SignupPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-10 sm:px-6">
      <SideNav active="landing" />
      <main className="min-w-0 flex-1 space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-4xl font-extrabold lowercase text-[color:var(--fog)]"
          >
            hedgpix
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-[color:var(--fog)]">
            Sign up
          </h1>
          <p className="mt-2 text-sm text-[color:var(--fog-dim)]">
            Create an account with email and password — no email confirmation
            required.
          </p>
        </div>
        <AuthForm mode="signup" />
      </main>
    </div>
  );
}
