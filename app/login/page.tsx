import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground text-2xl">
            ♥
          </div>
          <h1 className="text-2xl font-semibold">Baseline</h1>
          <p className="text-sm text-muted-foreground">Track less. Know more.</p>
        </div>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
