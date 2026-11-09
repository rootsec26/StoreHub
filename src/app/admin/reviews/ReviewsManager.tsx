"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Star,
  Store,
  Trash2,
} from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";

interface ReviewRow {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ReviewsResponse {
  reviews: ReviewRow[];
  total: number;
  page: number;
  pageSize: number;
  stores: { id: string; name: string }[];
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReviewsManager() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [rating, setRating] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (storeId) params.set("storeId", storeId);
      if (rating) params.set("rating", rating);
      const res = await fetch(`/api/admin/reviews?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load reviews");
      const data = (await res.json()) as ReviewsResponse;
      setReviews(data.reviews ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
      setStores(data.stores ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, storeId, rating]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function removeReview(review: ReviewRow) {
    if (deletingId) return;
    if (!window.confirm(`Delete the review by ${review.customerName}?`)) return;
    setDeletingId(review.id);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setReviews((current) => current.filter((row) => row.id !== review.id));
      setTotal((current) => Math.max(0, current - 1));
    } catch {
      setError("Failed to delete the review");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Store reviews
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Customer ratings and comments submitted on storefronts across the platform.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
          <Star className="h-3.5 w-3.5" />
          {total.toLocaleString("en-US")} reviews
        </span>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search customer, comment or store"
            className="w-72 ps-9"
          />
        </div>
        <Select
          value={storeId}
          onChange={(event) => {
            setStoreId(event.target.value);
            setPage(1);
          }}
          className="w-56"
          aria-label="Filter by store"
        >
          <option value="">All stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
        <Select
          value={rating}
          onChange={(event) => {
            setRating(event.target.value);
            setPage(1);
          }}
          className="w-36"
          aria-label="Filter by rating"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} ★
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ms-auto h-4 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No reviews found"
            description="Customer reviews appear here once shoppers rate a store."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviews.map((review) => (
              <li key={review.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {review.customerName}
                      </p>
                      <Stars rating={review.rating} />
                    </div>
                    {review.comment && (
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">
                        {review.comment}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-slate-400">
                      {formatDate(review.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Store className="h-3.5 w-3.5" />
                      <span className="font-medium text-slate-700">
                        {review.storeName}
                      </span>
                      <span className="text-slate-400">/{review.storeSlug}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeReview(review)}
                      disabled={deletingId === review.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                      aria-label="Delete review"
                    >
                      {deletingId === review.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {total.toLocaleString("en-US")} reviews
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
