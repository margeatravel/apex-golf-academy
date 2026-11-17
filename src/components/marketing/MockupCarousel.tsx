import { useEffect, useState } from 'react';
import mockupProzone from '@/assets/marketing/mockup-prozone.png';
import mockupVideo from '@/assets/marketing/mockup-video-analysis.png';
import mockupBooking from '@/assets/marketing/mockup-booking.png';
import mockupStats from '@/assets/marketing/mockup-stats.png';

const SLIDES = [
  {
    image: mockupProzone,
    eyebrow: 'Pro Zone',
    title: 'A members-only training library',
    description: 'Curated drills, lessons, and pro-level breakdowns — organized by skill so you always know what to work on next.',
  },
  {
    image: mockupVideo,
    eyebrow: 'Swing Analysis',
    title: 'Personalized video reviews',
    description: 'Upload a swing and get detailed coach feedback — frame by frame, with notes you can revisit anytime.',
  },
  {
    image: mockupBooking,
    eyebrow: 'Booking',
    title: 'Book lessons in seconds',
    description: 'Pick a time that works. Members lock in a recurring weekly Priority Spot — same day, same time, every week.',
  },
  {
    image: mockupStats,
    eyebrow: 'Progress',
    title: 'See your improvement',
    description: 'Log rounds, track your handicap, and earn SC Points for every lesson and milestone — redeemable for rewards.',
  },
];

const ROTATION_MS = 5000;

/**
 * Desktop-only auto-rotating carousel of feature mockups for the /auth left column.
 * Pauses on hover; click dots to jump.
 */
export function MockupCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const slide = SLIDES[index];

  return (
    <div
      className="relative h-full w-full flex flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex-1 flex items-center justify-center px-4 min-h-0">
        <div className="relative w-full max-w-[340px]">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 blur-3xl opacity-50"
            style={{
              background:
                'radial-gradient(circle at center, hsla(45,86%,60%,0.25), transparent 60%)',
            }}
          />
          {SLIDES.map((s, i) => (
            <img
              key={s.image}
              src={s.image}
              alt={s.title}
              loading={i === 0 ? 'eager' : 'lazy'}
              width={800}
              height={1280}
              className={`w-full h-auto drop-shadow-2xl transition-opacity duration-700 ${
                i === index ? 'opacity-100' : 'opacity-0 absolute inset-0'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Caption */}
      <div className="space-y-3 px-4 pt-6 text-left max-w-md">
        <div className="inline-flex items-center px-3 py-1 rounded-full bg-gold-accent/10 border border-gold-accent/30">
          <span className="text-xs font-semibold uppercase tracking-wider text-gold-accent">
            {slide.eyebrow}
          </span>
        </div>
        <h3 className="text-2xl font-heading font-bold text-ivory leading-tight min-h-[2.5rem]">
          {slide.title}
        </h3>
        <p className="text-sm text-ivory/70 leading-relaxed min-h-[3rem]">
          {slide.description}
        </p>

        {/* Dots */}
        <div className="flex items-center gap-2 pt-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.image}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${s.title}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? 'w-8 bg-gold-accent'
                  : 'w-1.5 bg-ivory/30 hover:bg-ivory/50'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}