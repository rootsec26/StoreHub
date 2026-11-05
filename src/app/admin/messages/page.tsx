import { isAdminAuthorized } from "@/lib/admin";

import MessagesManager from "./MessagesManager";

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

export default async function AdminMessagesPage() {
  const allowed = await isAdminAuthorized();
  if (!allowed) return <AdminOnly />;

  return <MessagesManager />;
}
