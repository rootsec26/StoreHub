"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  Check,
  Loader2,
  MessageSquare,
  Package,
  Send,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";

import { useCartStore } from "@/lib/cart";
import { useI18n, type TranslationKey, type TranslationVars } from "@/lib/i18n";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { productPath } from "@/lib/site";
import { useStoreCurrency } from "@/components/CurrencySelector";

interface AssistantStore {
  name: string;
  currency: string;
  supportedCurrencies: string[];
}

export interface RecommendedProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryName: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: RecommendedProduct[];
  pending?: boolean;
  error?: boolean;
}

interface AIShoppingAssistantProps {
  slug: string;
  store: AssistantStore;
}

type Translate = (
  key: TranslationKey,
  vars?: TranslationVars
) => string;

const QUICK_PROMPTS: TranslationKey[] = [
  "assistant.chipBestSellers",
  "assistant.chipBudget",
  "assistant.chipSuggest",
];

let messageSequence = 0;

function nextMessageId(): string {
  messageSequence += 1;
  return `assistant-msg-${messageSequence}`;
}

interface ProductCardProps {
  slug: string;
  product: RecommendedProduct;
  formattedPrice: (amount: number) => string;
  isAdded: boolean;
  onAdd: (product: RecommendedProduct) => void;
  t: Translate;
}

function AssistantProductCard({
  slug,
  product,
  formattedPrice,
  isAdded,
  onAdd,
  t,
}: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const href = productPath(slug, product.id);

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3 shadow-sm"
      style={{
        borderColor: "var(--color-primary-soft)",
        backgroundColor: "var(--color-background)",
      }}
    >
      <div className="flex gap-3">
        <Link
          href={href}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100"
          aria-label={product.name}
        >
          {isValidImageUrl(product.imageUrl) ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="64px"
              unoptimized={!canOptimizeImage(product.imageUrl)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Package className="h-7 w-7 text-slate-300" />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="block truncate text-sm font-semibold hover:underline"
            style={{ color: "var(--color-text)" }}
          >
            {product.name}
          </Link>
          <p
            className="mt-0.5 text-sm font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            {formattedPrice(parseFloat(product.price))}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                outOfStock
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "text-[var(--color-primary)]"
              }`}
              style={
                outOfStock
                  ? undefined
                  : { backgroundColor: "var(--color-primary-soft)" }
              }
            >
              {outOfStock
                ? t("store.outOfStock")
                : t("store.left", { count: product.stock })}
            </span>
            {product.categoryName && (
              <span
                className="truncate text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {product.categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAdd(product)}
        disabled={outOfStock}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "#ffffff",
        }}
      >
        {isAdded ? (
          <>
            <Check className="h-3.5 w-3.5" />
            {t("product.addedToCart")}
          </>
        ) : (
          <>
            <ShoppingBag className="h-3.5 w-3.5" />
            {t("store.addToCart")}
          </>
        )}
      </button>
    </div>
  );
}

export default function AIShoppingAssistant({
  slug,
  store,
}: AIShoppingAssistantProps) {
  const { t, locale } = useI18n();
  const { currency: selectedCurrency, formattedPrice } = useStoreCurrency(
    store.currency,
    store.supportedCurrencies,
    locale
  );

  const cart = useCartStore();
  const isHydrated = useCartStore((state) => state._hydrated ?? false);
  const cartItemCount = useCartStore((state) => state.items.length);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    useCartStore.setState({ _hydrated: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  function openChat() {
    setOpen(true);
    if (!greetedRef.current) {
      greetedRef.current = true;
      setMessages([
        { id: nextMessageId(), role: "assistant", text: t("assistant.greeting") },
      ]);
    }
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeChat() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleAddToCart(product: RecommendedProduct) {
    cart.addItem(
      {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        imageUrl: product.imageUrl,
      },
      slug
    );

    setAddedProductId(product.id);
    if (addedTimerRef.current !== null) {
      window.clearTimeout(addedTimerRef.current);
    }
    addedTimerRef.current = window.setTimeout(() => {
      setAddedProductId(null);
      addedTimerRef.current = null;
    }, 2000);
  }

  async function handleSend(rawText: string) {
    const text = rawText.trim();
    if (!text || sending) return;

    setInput("");
    setMessages((previous) => [
      ...previous,
      { id: nextMessageId(), role: "user", text },
    ]);

    const pendingId = nextMessageId();
    setSending(true);
    setMessages((previous) => [
      ...previous,
      {
        id: pendingId,
        role: "assistant",
        text: t("assistant.thinking"),
        pending: true,
      },
    ]);

    try {
      const response = await fetch("/api/storefront/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: slug,
          message: text,
          locale,
          currency: selectedCurrency,
        }),
      });

      if (!response.ok) {
        throw new Error(`Assistant request failed with ${response.status}`);
      }

      const data = (await response.json()) as {
        replyText?: unknown;
        recommendedProducts?: unknown;
      };

      const replyText =
        typeof data.replyText === "string" && data.replyText.trim()
          ? data.replyText
          : t("assistant.error");
      const recommendedProducts = Array.isArray(data.recommendedProducts)
        ? (data.recommendedProducts as RecommendedProduct[])
        : [];

      setMessages((previous) =>
        previous.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: "assistant",
                text: replyText,
                products: recommendedProducts,
              }
            : message
        )
      );
    } catch {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: "assistant",
                text: t("assistant.error"),
                error: true,
              }
            : message
        )
      );
    } finally {
      setSending(false);
    }
  }

  const hasCartPill = isHydrated && cartItemCount > 0;
  const triggerPosition = hasCartPill
    ? "bottom-20 end-4 sm:bottom-24 sm:end-6"
    : "bottom-4 end-4 sm:bottom-6 sm:end-6";
  const panelPosition = hasCartPill
    ? "bottom-36 sm:bottom-40"
    : "bottom-24 sm:bottom-28";

  return (
    <>
      {/* Floating trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeChat() : openChat())}
        aria-label={open ? t("common.close") : t("assistant.trigger")}
        aria-expanded={open}
        title={t("assistant.trigger")}
        className={`fixed z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-300 hover:scale-105 ${triggerPosition}`}
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <span className="relative">
          {open ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageSquare className="h-6 w-6" />
          )}
          {!open && (
            <Sparkles
              className="absolute -end-1.5 -top-1.5 h-3.5 w-3.5 text-yellow-300"
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {/* Chat panel */}
      <div
        role="dialog"
        aria-label={t("assistant.title")}
        aria-hidden={!open}
        inert={!open}
        className={`fixed end-4 z-40 flex w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden border shadow-2xl transition-all duration-300 ease-out sm:end-6 ${panelPosition} ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-8 opacity-0"
        }`}
        style={{
          height: "min(65vh, 560px)",
          backgroundColor: "var(--color-background)",
          borderColor: "var(--color-primary-soft)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Bot className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {t("assistant.title")}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-white/80">
              <Sparkles className="h-3 w-3 shrink-0" />
              {store.name}
            </p>
          </div>
          <button
            type="button"
            onClick={closeChat}
            aria-label={t("common.close")}
            className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="scrollbar-thin flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--color-primary-soft)" }}
              >
                <Bot
                  className="h-7 w-7"
                  style={{ color: "var(--color-primary)" }}
                />
              </span>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {t("assistant.greeting")}
              </p>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className="flex flex-col gap-2">
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? "self-end text-white"
                      : message.error
                        ? "self-start border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                        : "self-start text-[var(--color-text)]"
                  }`}
                  style={
                    isUser
                      ? { backgroundColor: "var(--color-primary)" }
                      : message.error
                        ? undefined
                        : { backgroundColor: "var(--color-primary-soft)" }
                  }
                >
                  {message.pending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {message.text}
                    </span>
                  ) : (
                    message.text
                  )}
                </div>

                {message.products && message.products.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("assistant.picks")}
                    </p>
                    {message.products.map((product) => (
                      <AssistantProductCard
                        key={product.id}
                        slug={slug}
                        product={product}
                        formattedPrice={formattedPrice}
                        isAdded={addedProductId === product.id}
                        onAdd={handleAddToCart}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick prompts + composer */}
        <div
          className="border-t px-3 pt-2.5 pb-3"
          style={{ borderColor: "var(--color-primary-soft)" }}
        >
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-2">
            {QUICK_PROMPTS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSend(t(key))}
                disabled={sending}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                style={{
                  borderColor: "var(--color-primary-soft)",
                  color: "var(--color-primary)",
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              dir="auto"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("assistant.placeholder")}
              maxLength={400}
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              style={{
                borderColor: "var(--color-primary-soft)",
                backgroundColor: "var(--color-background)",
                color: "var(--color-text)",
              }}
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              aria-label={t("assistant.send")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "#ffffff",
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
