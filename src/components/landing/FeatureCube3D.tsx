import type { CSSProperties } from "react";
import {
  BarChart3,
  Bot,
  CreditCard,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";

const FACES = [
  { icon: ShoppingBag, face: "fc-front", tint: "fc-tint-indigo" },
  { icon: Bot, face: "fc-back", tint: "fc-tint-violet" },
  { icon: CreditCard, face: "fc-right", tint: "fc-tint-sky" },
  { icon: BarChart3, face: "fc-left", tint: "fc-tint-indigo" },
  { icon: Sparkles, face: "fc-top", tint: "fc-tint-violet" },
  { icon: Truck, face: "fc-bottom", tint: "fc-tint-sky" },
] as const;

function OrbitRing({
  tilt,
  spin,
  dotClass,
}: {
  tilt: string;
  spin: string;
  dotClass: string;
}) {
  return (
    <div className={`feature-orbit-ring ${tilt}`}>
      <div className={`orbit-spin ${spin}`}>
        {[0, 120, 240].map((angle) => (
          <div
            key={angle}
            className="orbit-arm"
            style={{ "--orbit-angle": `${angle}deg` } as CSSProperties}
          >
            <span className={`orbit-dot ${dotClass}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Standalone CSS-3D feature visual: a glass tech cube tumbling on two tilted
 * orbit rings. Pure CSS transforms — no JS animation, no layout shift.
 */
export default function FeatureCube3D() {
  return (
    <div className="feature-cube-scene" aria-hidden="true">
      <div className="feature-cube-float">
        <div className="feature-orbit">
          <OrbitRing
            tilt="orbit-tilt-a"
            spin="orbit-spin-a"
            dotClass="orbit-dot-indigo"
          />
          <OrbitRing
            tilt="orbit-tilt-b"
            spin="orbit-spin-b"
            dotClass="orbit-dot-sky"
          />
        </div>
        <div className="feature-cube">
          {FACES.map(({ icon: Icon, face, tint }) => (
            <div key={face} className={`feature-cube-face ${face} ${tint}`}>
              <Icon className="feature-cube-icon" strokeWidth={1.6} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
