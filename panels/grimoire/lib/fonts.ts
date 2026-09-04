/**
 * The estate's two hands: a warm serif for the familiar and the study, and a
 * script for the deep tongue's verse. Both are KaTeX faces (SIL Open Font
 * Licence), shipped with the panel so the spellbook looks the same on every
 * machine. Injected once as @font-face rules.
 */
import mainRegular from "../assets/fonts/KaTeX_Main-Regular.woff2";
import mainItalic from "../assets/fonts/KaTeX_Main-Italic.woff2";
import mainBold from "../assets/fonts/KaTeX_Main-Bold.woff2";
import script from "../assets/fonts/KaTeX_Script-Regular.woff2";
import caligraphic from "../assets/fonts/KaTeX_Caligraphic-Regular.woff2";

export const SERIF = `"Grimoire Serif", "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`;
export const HAND = `"Grimoire Hand", "Apple Chancery", "Segoe Script", "URW Chancery L", cursive`;
export const CAPITALS = `"Grimoire Capitals", "Grimoire Serif", Georgia, serif`;

let installed = false;

export function installFonts(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const style = document.createElement("style");
  style.setAttribute("data-grimoire-fonts", "");
  style.textContent = `
@font-face { font-family: "Grimoire Serif"; src: url("${mainRegular}") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Grimoire Serif"; src: url("${mainItalic}") format("woff2"); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: "Grimoire Serif"; src: url("${mainBold}") format("woff2"); font-weight: 600 700; font-style: normal; font-display: swap; }
@font-face { font-family: "Grimoire Hand"; src: url("${script}") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Grimoire Capitals"; src: url("${caligraphic}") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
.grimoire-react, .app { --serif: ${SERIF}; --hand: ${HAND}; --capitals: ${CAPITALS}; }
.grimoire-react textarea, .grimoire-react .g-verse, .grimoire-react blockquote { font-family: var(--hand); }
`;
  document.head.appendChild(style);
}
