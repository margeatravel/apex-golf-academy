import { ApexMark } from '@/components/ApexBrand';

interface Props {
  /** id of the login form anchor to scroll to */
  loginAnchorId?: string;
  /** Deprecated — CTA was removed. Kept for backward compatibility. */
  hideCta?: boolean;
  /** Hide the duplicate logo above the headline (used on desktop where a sticky brand bar already shows it) */
  hideLogo?: boolean;
  /** Render only the logo + headline (no description paragraph). */
  headlineOnly?: boolean;
  /** Render only the description paragraph (no logo, no headline). */
  descriptionOnly?: boolean;
}

/**
 * Top hero shown above the feature showcase on mobile, and (in compact form)
 * on the desktop branding column.
 */
export function AuthHero({ hideLogo = false, headlineOnly = false, descriptionOnly = false }: Props) {
  if (descriptionOnly) {
    return (
      <section className="text-center pt-2 pb-8 sm:pb-10">
        <p className="text-base sm:text-lg text-ivory/70 leading-relaxed px-4 max-w-xl mx-auto">
          Your private training portal — book lessons with your Coach, review your swing, and unlock the members-only Pro Zone.
        </p>
      </section>
    );
  }

  return (
    <section className="text-center pt-4 pb-6 sm:pb-8 space-y-6">
      {!hideLogo && (
        <div className="flex justify-center">
          <ApexMark size="xl" glow />
        </div>
      )}

      <div className="space-y-3 max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-heading font-bold text-ivory leading-tight">
          Train smarter.
          <br />
          <span className="text-gold-accent">Play better.</span>
        </h1>
        {!headlineOnly && (
          <p className="text-base sm:text-lg text-ivory/70 leading-relaxed px-4">
            Your private training portal — book lessons with your Coach, review your swing, and unlock the members-only Pro Zone.
          </p>
        )}
      </div>
    </section>
  );
}