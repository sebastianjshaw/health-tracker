import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { BottomNav } from "@/components/BottomNav";
import { getProfile } from "@/lib/settings";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const profile = await getProfile();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-accent">♥</span> Baseline
          </Link>
          <AccountMenu name={profile.name} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-4">{children}</main>

      <BottomNav />
    </>
  );
}
