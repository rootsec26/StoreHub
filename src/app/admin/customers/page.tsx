import { Suspense } from "react";

import { isAdminAuthorized } from "@/lib/admin";

import CustomersManager from "./CustomersManager";

export const runtime = "nodejs";

function AdminOnly() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-lg text-slate-500">
          Admin panel requires a valid admin token
        </p>
      </div>
    </div>
  );
}

export default async function AdminCustomersPage() {
  const allowed = await isAdminAuthorized();
  if (!allowed) return <AdminOnly />;

  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white" />}>
      <CustomersManager />
    </Suspense>
  );
}
