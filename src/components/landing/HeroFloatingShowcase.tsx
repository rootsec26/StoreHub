"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Sparkles, TrendingUp, Wallet } from "lucide-react";

type Tilt = { x: number; y: number };

export default function HeroFloatingShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx =
        (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const ny =
        (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setTilt({
          x: Math.max(-1, Math.min(1, nx)),
          y: Math.max(-1, Math.min(1, ny)),
        });
      });
    };
    const reset = () => setTilt({ x: 0, y: 0 });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ perspective: "1100px" }}
    >
      <div className="absolute inset-0 origin-center scale-[0.72] sm:scale-95 lg:scale-100">
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${(-tilt.y * 9).toFixed(2)}deg) rotateY(${(tilt.x * 11).toFixed(2)}deg)`,
          }}
        >
          {/* Main frosted-glass store card */}
          <div
            className="absolute -left-1 top-6 w-32 sm:-left-3 sm:top-10 sm:w-44 lg:w-48"
            style={{ transform: "translateZ(36px)" }}
          >
            <div className="animate-hero-float rounded-2xl border border-white/70 bg-white/65 p-3 shadow-[0_20px_50px_-20px_rgba(79,70,229,0.45)] backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-[10px] font-extrabold text-white shadow-md shadow-indigo-500/30">
                  ن
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[11px] font-bold text-slate-900 sm:text-xs">
                    متجر النور
                    <BadgeCheck className="h-3 w-3 shrink-0 text-sky-500" />
                  </p>
                  <p className="text-[9px] text-slate-500 sm:text-[10px]">
                    أزياء وإكسسوارات
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-500/10 via-sky-500/10 to-transparent p-2">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 sm:h-11 sm:w-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-slate-800 sm:text-[11px]">
                    عباية كلاسيك
                  </p>
                  <p className="text-[9px] font-bold text-indigo-600 sm:text-[10px]">
                    ١٬٢٠٠ ج.م
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/10 px-2 py-1">
                <span className="text-[9px] font-bold text-emerald-700 sm:text-[10px]">
                  مبيعات اليوم
                </span>
                <span className="flex items-center gap-0.5 text-[9px] font-extrabold text-emerald-600 sm:text-[10px]">
                  <TrendingUp className="h-3 w-3" />
                  +٣٢٪
                </span>
              </div>
            </div>
          </div>

          {/* Floating chip — new order */}
          <div
            className="absolute -right-1 top-2 w-28 sm:-right-3 sm:top-4 sm:w-36 lg:top-8 lg:w-40"
            style={{ transform: "translateZ(72px)" }}
          >
            <div className="animate-hero-float-delayed flex items-center gap-2 rounded-2xl border border-indigo-100/80 bg-white/70 px-3 py-2.5 shadow-[0_16px_40px_-18px_rgba(99,102,241,0.5)] backdrop-blur-xl">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/40">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-900 sm:text-xs">
                  طلب جديد
                </p>
                <p className="text-[9px] text-slate-500 sm:text-[10px]">
                  قبل ٣ دقائق
                </p>
              </div>
            </div>
          </div>

          {/* Floating chip — COD payment */}
          <div
            className="absolute bottom-4 -right-1 w-28 sm:bottom-8 sm:-right-3 sm:w-36 lg:bottom-12 lg:-right-6 lg:w-40"
            style={{ transform: "translateZ(56px)" }}
          >
            <div className="animate-hero-float flex items-center gap-2 rounded-2xl border border-sky-100/80 bg-white/70 px-3 py-2.5 shadow-[0_16px_40px_-18px_rgba(14,165,233,0.45)] backdrop-blur-xl">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-sky-500/40">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-900 sm:text-xs">
                  دفع عند الاستلام
                </p>
                <p className="text-[9px] font-bold text-sky-600 sm:text-[10px]">
                  COD · مدفوع
                </p>
              </div>
            </div>
          </div>

          {/* Ambient glow orb behind the cluster */}
          <div
            className="absolute left-1/2 top-1/2 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.22),rgba(14,165,233,0.12)_55%,transparent_75%)] blur-2xl sm:h-72 sm:w-72"
            style={{ transform: "translate(-50%, -50%) translateZ(-40px)" }}
          />
        </div>
      </div>
    </div>
  );
}
