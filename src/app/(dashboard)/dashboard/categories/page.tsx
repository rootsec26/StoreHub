"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, X, FolderOpen } from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface Category {
  id: string;
  name: string;
  createdAt: string;
}

/** Network-only fetch (no state) so effects can chain it without setState. */
async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch("/api/categories");
    const data = await res.json();
    return data.categories || [];
  } catch (error) {
    console.error("Failed to load categories:", error);
    return [];
  }
}

export default function CategoriesPage() {
  const { t, formatDate } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setCategories(await fetchCategories());
  }, []);

  useEffect(() => {
    fetchCategories()
      .then((rows) => setCategories(rows))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName }),
      });

      if (!res.ok) {
        throw new Error(t("categories.toast.failed"));
      }

      setToast(t("categories.toast.created"));
      setShowForm(false);
      setFormName("");
      loadData();
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("categories.toast.failed"));
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("categories.deleteConfirm"))) return;

    try {
      const res = await fetch(`/api/categories?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setToast(t("categories.toast.deleted"));
      loadData();
    } catch {
      setToast(t("categories.toast.failed"));
    }
  }

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {categories.length === 1
            ? t("categories.countOne")
            : t("categories.countMany", { count: categories.length })}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t("categories.add")}
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {t("categories.newTitle")}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("categories.field.name")}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("categories.placeholder")}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg bg-white p-4 shadow-sm"
            >
              <div className="h-5 w-24 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("categories.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("categories.emptySubtitle")}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <FolderOpen className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{category.name}</p>
                  <p className="text-xs text-slate-500">
                    {t("categories.createdOn", {
                      date: formatDate(category.createdAt),
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(category.id)}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
