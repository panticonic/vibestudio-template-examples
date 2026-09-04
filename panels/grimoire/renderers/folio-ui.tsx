import type { CSSProperties, ReactNode } from "react";

export const folioCardBase: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  maxWidth: 640,
  overflow: "hidden",
  fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif",
};

export function FolioPill({
  glyph,
  children,
  detail,
}: {
  glyph: string;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minWidth: 0,
        gap: 7,
        color: "#dfbd7c",
        fontFamily: "Georgia,serif",
      }}
    >
      <span style={{ color: "#c58b3b" }}>{glyph}</span>
      <b
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </b>
      {detail ? (
        <small
          style={{
            opacity: 0.6,
            font: "700 10px Inter,system-ui,sans-serif",
            letterSpacing: ".05em",
            textTransform: "uppercase",
          }}
        >
          {detail}
        </small>
      ) : null}
    </span>
  );
}
