import { AppShell } from "@/components/AppChrome";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AppShell
      active="landing"
      title="Log in"
      description="Access followed stocks and members."
    >
      <div className="mx-auto max-w-md pt-2">
        <AuthForm mode="login" />
      </div>
    </AppShell>
  );
}
