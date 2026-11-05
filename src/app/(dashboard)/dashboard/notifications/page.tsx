"use client";

import { Suspense } from "react";

import Skeleton from "@/components/ui/Skeleton";
import NotificationsManager from "@/components/dashboard/notifications/NotificationsManager";

function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NotificationsManager />
    </Suspense>
  );
}
