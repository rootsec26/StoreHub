import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import AdminNav from "@/components/admin/AdminNav";
import { isAdminAuthorized } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * Shared admin chrome. Authorization is decided by each page (which renders a
 * 404 when unauthorized), so the layout only decorates authorized content.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const allowed = await isAdminAuthorized();
  if (!allowed) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="fixed end-4 top-4 z-50 rounded-lg bg-red-600 px-4 py-2 font-mono text-sm text-white shadow-lg">
        🔒 LOCALHOST ONLY ADMIN PANEL
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 pe-64">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900"
            >
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              StoreHub Admin
            </Link>
            <p className="mt-1 text-sm text-slate-500">
              Platform operations, merchants, users and messaging.
            </p>
          </div>
        </header>

        <div className="mb-6">
          <AdminNav />
        </div>

        {children}
      </div>
    </div>
  );
}
