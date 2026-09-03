/**
 * Procedural portraits and crests. Every courtier gets a face and every
 * house a shield, generated from the seed the engine stored, so they are the
 * same on every panel and every reload.
 */
import { createRng } from "@workspace/regency-engine";

const SKINS = ["#f1d3b3", "#e8bf9a", "#d9a877", "#c48a5a", "#a86a3f", "#7d4b2a"];
const HAIRS = ["#2b1d12", "#4a2f1a", "#7a4a22", "#b07a3a", "#d9b56b", "#8f8f8f", "#e9e4d8", "#3a2a2a"];
const CLOTH = ["#6b2d2d", "#2d4a6b", "#3d6b3a", "#6b5a2d", "#4b2d6b", "#2d6b66", "#5a5a5a"];

/**
 * A face from a seed. `variant: "adult"` grows the same child up: a longer
 * face, a plainer hairline, a set jaw — the heir at their majority is
 * recognisably the heir, only older.
 */
export function portraitSvg(seed: number, accent: string, size = 64, variant: "default" | "adult" = "default"): string {
  const rng = createRng(seed);
  const adult = variant === "adult";
  const skin = rng.pick(SKINS);
  const hair = rng.pick(HAIRS);
  const cloth = rng.chance(0.5) ? accent : rng.pick(CLOTH);
  const faceW = 22 + rng.int(8) - (adult ? 1 : 0);
  const faceH = 28 + rng.int(8) + (adult ? 4 : 0);
  const eyeY = 30 + rng.int(4);
  const eyeGap = 6 + rng.int(3);
  const hairStyle = rng.int(4);
  const beard = adult ? rng.chance(0.6) : rng.chance(0.35);
  const brows = adult ? true : rng.chance(0.7);
  const nose = rng.int(3);
  const mouth = rng.int(3);
  const cx = 32;
  const cy = 34;
  const parts: string[] = [];
  parts.push(`<rect width="64" height="64" rx="10" fill="${accent}" fill-opacity="${adult ? 0.26 : 0.18}"/>`);
  parts.push(`<circle cx="32" cy="30" r="27" fill="${accent}" fill-opacity="0.12"/>`);
  // shoulders
  parts.push(`<path d="M8 64 q4 -18 24 -18 q20 0 24 18 z" fill="${cloth}"/>`);
  parts.push(`<path d="M22 50 l10 8 l10 -8" fill="none" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>`);
  // hair back
  if (hairStyle === 2) parts.push(`<ellipse cx="${cx}" cy="${cy + 6}" rx="${faceW / 2 + 5}" ry="${faceH / 2 + 8}" fill="${hair}"/>`);
  // face
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${faceW / 2}" ry="${faceH / 2}" fill="${skin}"/>`);
  // hair front
  if (hairStyle === 0) parts.push(`<path d="M${cx - faceW / 2 - 1} ${cy - 4} q${faceW / 2 + 1} -${faceH / 2 + 10} ${faceW + 2} 0 q-4 -6 -${faceW / 2 + 1} -8 q-${faceW / 2 + 1} 2 -${faceW / 2 + 1} 8z" fill="${hair}"/>`);
  if (hairStyle === 1) parts.push(`<path d="M${cx - faceW / 2} ${cy - 2} q${faceW / 2} -${faceH / 2 + 6} ${faceW} 0 l0 -3 q-${faceW / 2} -${faceH / 2 + 4} -${faceW} 0z" fill="${hair}"/>`);
  if (hairStyle === 2) parts.push(`<path d="M${cx - faceW / 2 - 2} ${cy} q${faceW / 2 + 2} -${faceH / 2 + 12} ${faceW + 4} 0 z" fill="${hair}"/>`);
  if (hairStyle === 3) parts.push(`<path d="M${cx - faceW / 2 + 3} ${cy - 8} q${faceW / 2 - 3} -${faceH / 2} ${faceW - 6} 0z" fill="${hair}" opacity="0.7"/>`);
  // eyes
  const eyeL = cx - eyeGap;
  const eyeR = cx + eyeGap;
  parts.push(`<ellipse cx="${eyeL}" cy="${eyeY}" rx="2.4" ry="1.6" fill="#fff"/><ellipse cx="${eyeR}" cy="${eyeY}" rx="2.4" ry="1.6" fill="#fff"/>`);
  parts.push(`<circle cx="${eyeL}" cy="${eyeY}" r="1.1" fill="#2b1d12"/><circle cx="${eyeR}" cy="${eyeY}" r="1.1" fill="#2b1d12"/>`);
  if (brows) parts.push(`<path d="M${eyeL - 3} ${eyeY - 4} l6 -1 M${eyeR - 3} ${eyeY - 5} l6 1" stroke="${hair}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`);
  // nose
  if (nose === 0) parts.push(`<path d="M${cx} ${eyeY + 2} l-2 7 h4" fill="none" stroke="#00000033" stroke-width="1.2"/>`);
  if (nose === 1) parts.push(`<path d="M${cx} ${eyeY + 2} q-3 6 0 8" fill="none" stroke="#00000033" stroke-width="1.2"/>`);
  if (nose === 2) parts.push(`<path d="M${cx} ${eyeY + 2} l-1 6 l2 1" fill="none" stroke="#00000033" stroke-width="1.2"/>`);
  // mouth
  const my = eyeY + 13;
  if (mouth === 0) parts.push(`<path d="M${cx - 4} ${my} q4 3 8 0" fill="none" stroke="#7a3b3b" stroke-width="1.4" stroke-linecap="round"/>`);
  if (mouth === 1) parts.push(`<path d="M${cx - 4} ${my} h8" fill="none" stroke="#7a3b3b" stroke-width="1.4" stroke-linecap="round"/>`);
  if (mouth === 2) parts.push(`<path d="M${cx - 4} ${my + 1} q4 -3 8 0" fill="none" stroke="#7a3b3b" stroke-width="1.4" stroke-linecap="round"/>`);
  if (beard) parts.push(`<path d="M${cx - faceW / 2 + 2} ${cy + 4} q${faceW / 2 - 2} ${faceH / 2 + 4} ${faceW - 4} 0 q-${faceW / 2 - 2} ${faceH / 4} -${faceW - 4} 0z" fill="${hair}" opacity="0.9"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img">${parts.join("")}</svg>`;
}

const CHARGES = ["♛", "⚔", "✶", "☽", "❦", "⚜", "♞", "✠", "⚓", "☀", "✦", "⚘"];

export function crestSvg(seed: number, color: string, size = 28): string {
  const rng = createRng(seed + 7);
  const division = rng.int(4);
  const metal = rng.chance(0.5) ? "#f3e6c4" : "#e6e6e6";
  const charge = rng.pick(CHARGES);
  const shield = "M4 3 h20 v11 q0 9 -10 13 q-10 -4 -10 -13 z";
  const parts: string[] = [`<defs><clipPath id="s${seed}"><path d="${shield}"/></clipPath></defs>`];
  parts.push(`<path d="${shield}" fill="${color}"/>`);
  if (division === 1) parts.push(`<rect x="4" y="3" width="10" height="26" fill="${metal}" clip-path="url(#s${seed})"/>`);
  if (division === 2) parts.push(`<rect x="4" y="3" width="20" height="11" fill="${metal}" clip-path="url(#s${seed})"/>`);
  if (division === 3) parts.push(`<path d="M4 3 L24 29 L24 3 z" fill="${metal}" clip-path="url(#s${seed})"/>`);
  parts.push(`<text x="14" y="19" text-anchor="middle" font-size="12" fill="${division === 0 ? metal : color}" font-family="serif">${charge}</text>`);
  parts.push(`<path d="${shield}" fill="none" stroke="#2b1d12" stroke-width="1.2"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 32" width="${size}" height="${(size * 32) / 28}">${parts.join("")}</svg>`;
}
