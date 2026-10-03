import { isLocalhostRequest } from "@/lib/admin";

import CodesManager from "./CodesManager";

export const runtime = "nodejs";

function LocalhostOnly() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-lg text-slate-500">
          Admin panel is only accessible on localhost
        </p>
      </div>
    </div>
  );
}

/** Super Admin activation-code generator + inventory (`/admin/codes`). */
export default async function AdminCodesPage() {
  const allowed = await isLocalhostRequest();
  if (!allowed) return <LocalhostOnly />;

  return <CodesManager />;
}
