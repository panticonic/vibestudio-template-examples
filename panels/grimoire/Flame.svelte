<script lang="ts">
  /** The fire drawn in the margin: steady when the circle is quiet, guttering while the familiar deliberates. */
  let { guttering = false, lit = true, size = 64 }: { guttering?: boolean; lit?: boolean; size?: number } = $props();
</script>

<svg class="flame" class:guttering class:unlit={!lit} width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden="true">
  <defs>
    <radialGradient id="flame-glow" cx="50%" cy="70%" r="60%">
      <stop offset="0%" stop-color="#ffb347" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#ffb347" stop-opacity="0" />
    </radialGradient>
  </defs>
  <ellipse class="glow" cx="20" cy="40" rx="20" ry="16" fill="url(#flame-glow)" />
  <path class="outer" d="M20 6 C 12 18, 8 24, 9 34 C 10 44, 30 44, 31 34 C 32 24, 28 18, 20 6 Z" fill="#e2792b" />
  <path class="inner" d="M20 18 C 16 26, 14 30, 15 36 C 16 42, 24 42, 25 36 C 26 30, 24 26, 20 18 Z" fill="#ffd27a" />
  <path class="logs" d="M4 48 L 36 44 M 6 44 L 34 50" stroke="#5a3a22" stroke-width="3" stroke-linecap="round" />
</svg>

<style>
  .flame { display: block; overflow: visible; }
  .outer, .inner, .glow { transform-origin: 20px 44px; }
  .outer { animation: sway 1.6s ease-in-out infinite alternate; }
  .inner { animation: sway 1.1s ease-in-out infinite alternate-reverse; }
  .glow { animation: breathe 2.4s ease-in-out infinite alternate; }
  .guttering .outer { animation: gutter 0.55s ease-in-out infinite alternate; }
  .guttering .inner { animation: gutter 0.4s ease-in-out infinite alternate-reverse; opacity: 0.7; }
  .guttering .glow { animation: breathe 0.9s ease-in-out infinite alternate; }
  .unlit .outer, .unlit .inner, .unlit .glow { opacity: 0; animation: none; }
  @keyframes sway { from { transform: scaleX(0.96) rotate(-2deg); } to { transform: scaleX(1.04) rotate(2deg); } }
  @keyframes gutter { from { transform: scale(0.75, 0.6) rotate(-6deg); } to { transform: scale(1.05, 1.1) rotate(5deg); } }
  @keyframes breathe { from { opacity: 0.6; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .outer, .inner, .glow { animation: none !important; } }
</style>
