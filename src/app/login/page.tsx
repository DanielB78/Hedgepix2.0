import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { SideNav } from "@/components/AppChrome";

export const dynamic = "force-dynamic";

export default function LoginPage() {
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
            Log in
          </h1>
          <p className="mt-2 text-sm text-[color:var(--fog-dim)]">
            Access your followed stocks and members.
          </p>
        </div>
        <AuthForm mode="login" />
      </main>
    </div>
  );
}
