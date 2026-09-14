import { AppShell } from "@/components/AppChrome";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AppShell
      active="landing"
      title="Sign up"
      description="Create an account with email and password — no email confirmation required."
    >
      <div className="mx-auto max-w-md pt-2">
        <AuthForm mode="signup" />
      </div>
    </AppShell>
  );
}
