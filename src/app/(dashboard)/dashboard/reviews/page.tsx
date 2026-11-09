"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface StoreReview {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ReviewsResponse {
  reviews: StoreReview[];
  average: number;
  count: number;
  perStar: Record<number, number>;
  storeSlug: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`h-4 w-4 ${
            value <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-slate-200 text-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { t, formatDate, formatNumber } = useI18n();

  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as ReviewsResponse);
    } catch {
      // Leave the empty state visible on failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const reviews = data?.reviews ?? [];
  const average = data?.average ?? 0;
  const count = data?.count ?? 0;
  const perStar = data?.perStar ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("reviews.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("reviews.subtitle")}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("reviews.average")}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-extrabold text-slate-900" dir="ltr">
              {average.toFixed(1)}
            </span>
            <span className="pb-1 text-sm text-slate-400">/ 5</span>
          </div>
          <div className="mt-2">
            <Stars rating={Math.round(average)} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("reviews.total")}
          </p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900" dir="ltr">
            {formatNumber(count)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            5 ★
          </p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900" dir="ltr">
            {formatNumber(perStar[5] ?? 0)}
          </p>
          <div className="mt-3 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const starCount = perStar[star] ?? 0;
              const pct = count > 0 ? Math.round((starCount / count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-[11px]">
                  <span className="w-3 text-slate-500" dir="ltr">
                    {star}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-end text-slate-400" dir="ltr">
                    {starCount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("reviews.submitting")}
          </div>
        ) : reviews.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            {t("reviews.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviews.map((review) => (
              <li key={review.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {review.customerName.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {review.customerName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(review.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Stars rating={review.rating} />
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
