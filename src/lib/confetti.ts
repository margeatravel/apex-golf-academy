import confetti from 'canvas-confetti';

export type CelebrationTier = 'scratch' | 'pro' | 'apex';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Standard burst — Scratch (green + ivory + soft gold)
function standardBurst() {
  const colors = ['#4a7c59', '#7BAE8C', '#F5F0E8', '#F0C040'];
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.9 },
    colors,
    zIndex: 9999,
    scalar: 0.9,
  });
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.85 },
      colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.85 },
      colors,
      zIndex: 9999,
    });
  }, 250);
}

// Pro burst — gold-forward with side cannons + star burst from top
function proGoldBurst() {
  const gold = ['#F0C040', '#D9AA42', '#E8D5B0', '#FFD970', '#C49A38'];

  // Side cannons
  const fireSides = () => {
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 65,
      startVelocity: 55,
      origin: { x: 0, y: 0.75 },
      colors: gold,
      zIndex: 9999,
      scalar: 1.1,
    });
    confetti({
      particleCount: 80,
      angle: 120,
      spread: 65,
      startVelocity: 55,
      origin: { x: 1, y: 0.75 },
      colors: gold,
      zIndex: 9999,
      scalar: 1.1,
    });
  };

  fireSides();
  setTimeout(fireSides, 350);

  // Star burst from top
  setTimeout(() => {
    confetti({
      particleCount: 70,
      spread: 110,
      startVelocity: 35,
      gravity: 0.7,
      origin: { x: 0.5, y: 0.1 },
      colors: gold,
      zIndex: 9999,
      shapes: ['star'],
      scalar: 1.3,
    });
  }, 600);

  // Final shimmer
  setTimeout(() => {
    confetti({
      particleCount: 120,
      spread: 100,
      origin: { x: 0.5, y: 0.5 },
      colors: gold,
      zIndex: 9999,
      scalar: 1.0,
    });
  }, 1200);
}

// Apex burst — cinematic royal blue + gold, longest duration
function apexRoyalBurst() {
  const blue = ['#3887FF', '#1E5FD8', '#5BA3FF', '#A8CEFF'];
  const gold = ['#F0C040', '#D9AA42', '#FFD970'];
  const ivory = ['#F5F0E8'];
  const all = [...blue, ...gold, ...ivory];

  // Top rain
  const duration = 4500;
  const end = Date.now() + duration;
  const rain = () => {
    confetti({
      particleCount: 5,
      angle: 90,
      spread: 80,
      startVelocity: 25,
      gravity: 0.85,
      origin: { x: Math.random(), y: -0.05 },
      colors: all,
      zIndex: 9999,
      scalar: 1.0,
      ticks: 250,
    });
    if (Date.now() < end) requestAnimationFrame(rain);
  };
  rain();

  // Side fireworks bursts
  const sideBurst = (delay: number) => {
    setTimeout(() => {
      confetti({
        particleCount: 90,
        angle: 60,
        spread: 70,
        startVelocity: 60,
        origin: { x: 0, y: 0.7 },
        colors: blue,
        zIndex: 9999,
        scalar: 1.2,
      });
      confetti({
        particleCount: 90,
        angle: 120,
        spread: 70,
        startVelocity: 60,
        origin: { x: 1, y: 0.7 },
        colors: blue,
        zIndex: 9999,
        scalar: 1.2,
      });
    }, delay);
  };
  sideBurst(0);
  sideBurst(700);
  sideBurst(1400);

  // Center gold star explosion
  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 130,
      startVelocity: 40,
      origin: { x: 0.5, y: 0.45 },
      colors: gold,
      zIndex: 9999,
      shapes: ['star'],
      scalar: 1.4,
    });
  }, 400);

  // Grand finale
  setTimeout(() => {
    confetti({
      particleCount: 200,
      spread: 160,
      startVelocity: 50,
      origin: { x: 0.5, y: 0.6 },
      colors: all,
      zIndex: 9999,
      scalar: 1.2,
    });
  }, 2200);
}

export function fireSignupConfetti(tier: string | null | undefined) {
  if (prefersReducedMotion()) return;
  const t = (tier || '').toLowerCase();
  // No confetti for free Member tier — paid plans only.
  if (t === 'apex') return apexRoyalBurst();
  if (t === 'pro') return proGoldBurst();
  if (t === 'scratch') return standardBurst();
  // member / free / unknown → no confetti
}
