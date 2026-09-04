import type { CSSProperties, MouseEvent, ReactNode } from "react";

const C = {
  ink: "#241c14",
  muted: "#766957",
  gold: "#9b6b23",
  goldBright: "#c99742",
  border: "rgba(111,78,35,.25)",
  paper: "#f4ead5",
  paperLight: "#fffaf0",
  night: "#182127",
  nightRaised: "#243039",
  cream: "#fff4d7",
  red: "#9b3c32",
  green: "#376a4b",
  blue: "#3f6677",
} as const;

export type Tone = "parchment" | "night" | "dispatch";

export function CourtCard({
  children,
  tone = "parchment",
  compact = false,
  maxWidth = 640,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  compact?: boolean;
  maxWidth?: number;
  style?: CSSProperties;
}) {
  const dark = tone === "night";
  const background = dark
    ? `radial-gradient(circle at 100% 0,${C.nightRaised},${C.night} 62%)`
    : tone === "dispatch"
      ? `linear-gradient(145deg,${C.paperLight},${C.paper})`
      : `linear-gradient(155deg,${C.paperLight},#ead9b8)`;
  return (
    <section
      style={{
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        maxWidth,
        overflow: "hidden",
        padding: compact ? "14px 16px" : "18px 19px",
        border: `1px solid ${dark ? "rgba(201,151,66,.3)" : C.border}`,
        borderRadius: 18,
        color: dark ? C.cream : C.ink,
        background,
        boxShadow: dark
          ? "0 18px 44px rgba(6,10,12,.25),inset 0 1px rgba(255,255,255,.05)"
          : "0 16px 38px rgba(55,36,16,.13),inset 0 1px rgba(255,255,255,.72)",
        fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Stack({
  children,
  gap = 10,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  return <div style={{ display: "grid", gap, ...style }}>{children}</div>;
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span
      style={{
        color: dark ? C.goldBright : C.gold,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: ".16em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export function CourtTitle({
  children,
  size = 22,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <h3
      style={{
        margin: 0,
        font: `600 ${size}px/1.18 Georgia,serif`,
        letterSpacing: "-.01em",
      }}
    >
      {children}
    </h3>
  );
}

const statusColour: Record<string, string> = {
  gold: C.gold,
  green: C.green,
  red: C.red,
  blue: C.blue,
  gray: C.muted,
};

export function Status({
  children,
  tone = "gold",
  dark = false,
}: {
  children: ReactNode;
  tone?: string;
  dark?: boolean;
}) {
  const colour = statusColour[tone] ?? C.gold;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 23,
        padding: "3px 9px",
        border: `1px solid ${colour}55`,
        borderRadius: 999,
        color: dark ? C.cream : colour,
        background: `${colour}18`,
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: ".04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export function Rule({ dark = false }: { dark?: boolean }) {
  return (
    <div
      style={{
        height: 1,
        background: dark ? "rgba(255,244,215,.13)" : C.border,
      }}
    />
  );
}

export function CourtLink({
  href,
  children,
  dark = false,
}: {
  href: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        color: dark ? "#e8c987" : "#76501d",
        fontSize: 12,
        fontWeight: 750,
      }}
    >
      {children}
    </a>
  );
}

export function CourtButton({
  children,
  onClick,
  disabled,
  variant = "seal",
}: {
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  variant?: "seal" | "veto" | "quiet";
}) {
  const colour =
    variant === "veto" ? C.red : variant === "quiet" ? C.muted : C.gold;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        minHeight: 36,
        padding: "8px 14px",
        border: `1px solid ${colour}77`,
        borderRadius: 999,
        color: variant === "seal" ? C.paperLight : colour,
        background:
          variant === "seal"
            ? `linear-gradient(135deg,#76501d,${C.gold})`
            : `${colour}12`,
        boxShadow: variant === "seal" ? "0 7px 18px rgba(94,60,20,.2)" : "none",
        font: "750 12px/1 Inter,ui-sans-serif,system-ui,sans-serif",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.58 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function CourtError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        padding: "9px 11px",
        border: `1px solid ${C.red}66`,
        borderRadius: 10,
        color: C.red,
        background: `${C.red}0e`,
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

export function PillFrame({
  glyph,
  children,
  status,
}: {
  glyph: string;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minWidth: 0,
        gap: 7,
        fontFamily: "Georgia,serif",
      }}
    >
      <span style={{ color: C.gold }}>{glyph}</span>
      <b
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </b>
      {status}
    </span>
  );
}

export const courtColours = C;
