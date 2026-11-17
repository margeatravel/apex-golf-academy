import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
  image: string;
  imageAlt: string;
  /** Reverse layout on desktop (image on left). Default: image on right. */
  reverse?: boolean;
}

/**
 * Marketing feature row used on /auth landing.
 * Mobile: stacked (text on top, image below).
 * Desktop: side-by-side, alternating image position via `reverse`.
 */
export function FeatureShowcase({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  description,
  bullets,
  image,
  imageAlt,
  reverse = false,
}: Props) {
  return (
    <section className="w-full py-10 sm:py-14">
      <div
        className={cn(
          'flex flex-col gap-8 items-center',
          'md:flex-row md:gap-12 lg:gap-16',
          reverse && 'md:flex-row-reverse',
        )}
      >
        {/* Text column */}
        <div className="flex-1 space-y-4 text-center md:text-left">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-accent/10 border border-gold-accent/30">
              {EyebrowIcon && <EyebrowIcon className="h-3.5 w-3.5 text-gold-accent" />}
              <span className="text-xs font-semibold uppercase tracking-wider text-gold-accent">
                {eyebrow}
              </span>
            </div>
          )}
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-ivory leading-tight">
            {title}
          </h3>
          <p className="text-base sm:text-lg text-ivory/70 leading-relaxed max-w-xl mx-auto md:mx-0">
            {description}
          </p>
          {bullets && bullets.length > 0 && (
            <ul className="space-y-2 pt-2 max-w-xl mx-auto md:mx-0">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-sm sm:text-base text-ivory/75 text-left"
                >
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 rounded-full bg-gold-accent shrink-0"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Image column */}
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="relative w-full max-w-[320px] sm:max-w-[380px]">
            {/* Soft glow behind the phone */}
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl opacity-40"
              style={{
                background:
                  'radial-gradient(circle at center, hsla(140,25%,40%,0.5), transparent 60%)',
              }}
            />
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              width={800}
              height={1280}
              className="w-full h-auto drop-shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}