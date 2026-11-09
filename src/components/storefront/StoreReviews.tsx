"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareQuote, Star } from "lucide-react";

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
}

function Stars({
  rating,
  size = "h-4 w-4",
  interactive = false,
  onSelect,
}: {
  rating: number;
  size?: string;
  interactive?: boolean;
  onSelect?: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          disabled={!interactive}
          onClick={() => onSelect?.(value)}
          className={interactive ? "p-0.5" : "cursor-default p-0.5"}
          aria-label={`${value}/5`}
        >
          <Star
            className={`${size} ${
              value <= rating
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200"
            } ${interactive ? "transition hover:scale-110" : ""}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function StoreReviews({
  slug,
  storeId,
  storeName,
}: {
  slug: string;
  storeId: string;
  storeName: string;
}) {
  const { t, formatDate } = useI18n();

  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Store owners may browse their own storefront while logged in — they must
  // not be able to review themselves (the API rejects it too).
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/storefront/reviews?storeSlug=${encodeURIComponent(slug)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as ReviewsResponse;
      setReviews(data.reviews ?? []);
      setAverage(data.average ?? 0);
      setCount(data.count ?? 0);
    } catch {
      // Reviews are non-critical — a failed fetch just shows the empty state.
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: { store?: { id?: string; slug?: string } | null } | null) => {
          if (cancelled || !data?.store) return;
          if (data.store.id === storeId || data.store.slug === slug) {
            setIsOwner(true);
          }
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, slug]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/storefront/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          storeSlug: slug,
          customerName: name,
          rating,
          comment,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        review?: StoreReview;
        error?: string;
      } | null;
      if (!res.ok || !data?.review) {
        setError(data?.error ?? t("reviews.submitError"));
        return;
      }
      setReviews((current) => [data.review as StoreReview, ...current]);
      setCount((current) => current + 1);
      setAverage((current) =>
        count === 0
          ? data.review!.rating
          : Math.round(
              ((current * count + data.review!.rating) / (count + 1)) * 10
            ) / 10
      );
      setName("");
      setComment("");
      setRating(5);
      setSubmitted(true);
    } catch {
      setError(t("reviews.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <MessageSquareQuote className="h-5 w-5 text-amber-500" />
                {t("reviews.title")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t("reviews.subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Stars rating={Math.round(average)} size="h-5 w-5" />
              <div className="leading-tight">
                <p className="text-lg font-extrabold text-slate-900" dir="ltr">
                  {average.toFixed(1)}
                </p>
                <p className="text-xs text-slate-500">
                  {t("reviews.count", { count })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1fr_320px]">
          <div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                {t("reviews.empty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
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

          {isOwner ? (
            <div className="flex h-fit items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center">
              <p className="text-sm font-medium text-indigo-700">
                {t("reviews.ownStore")}
              </p>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-sm font-bold text-slate-900">
              {t("reviews.writeYours")}
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("reviews.yourName")}
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("reviews.namePlaceholder")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("reviews.yourRating")}
              </label>
              <Stars rating={rating} interactive onSelect={setRating} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("reviews.yourComment")}
              </label>
              <textarea
                rows={3}
                maxLength={2000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("reviews.commentPlaceholder")}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
            {submitted && !error && (
              <p className="text-xs font-medium text-emerald-600">
                {t("reviews.thanks")}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t("reviews.submitting") : t("reviews.submit")}
            </button>
            <p className="text-center text-[11px] text-slate-400">
              {t("reviews.forStore", { name: storeName })}
            </p>
          </form>
          )}
        </div>
      </div>
    </section>
  );
}
