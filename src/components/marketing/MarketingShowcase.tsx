import { Sparkles, PlayCircle, Calendar, BarChart3, Bot } from 'lucide-react';
import mockupProzone from '@/assets/marketing/mockup-prozone.png';
import mockupVideo from '@/assets/marketing/mockup-video-analysis.png';
import mockupBooking from '@/assets/marketing/mockup-booking.png';
import mockupStats from '@/assets/marketing/mockup-stats.png';
import mockupApexAi from '@/assets/marketing/mockup-apex-ai.png';
import { FeatureShowcase } from './FeatureShowcase';

/**
 * The 4 feature cards (Pro Zone, Swing Analysis, Booking, Progress) used on /auth.
 * Same content on mobile and desktop — only the surrounding layout (column
 * width, padding, scroll behavior) differs.
 */
export function MarketingShowcase() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <FeatureShowcase
        eyebrow="Apex AI"
        eyebrowIcon={Bot}
        title="Your AI golf coach, on demand"
        description="Conversational AI trained on your Coach's methodology — ask anything about your swing, strategy, or practice plan and get an instant, personalized answer."
        bullets={[
          "Instant answers grounded in your Coach's philosophy",
          'Practice plans tailored to your level and goals',
          'Available 24/7 from any device',
        ]}
        image={mockupApexAi}
        imageAlt="Apex AI coaching chat on iPhone"
      />
      <FeatureShowcase
        eyebrow="Pro Zone"
        eyebrowIcon={Sparkles}
        title="A members-only training library"
        description="Curated drills, lessons, and pro-level breakdowns — organized by skill so you always know what to work on next."
        bullets={[
          'Putting, driving, iron play & mental game',
          'New content added regularly',
          'Watch on any device, anytime',
        ]}
        image={mockupProzone}
        imageAlt="Pro Zone members-only library on iPhone"
      />
      <FeatureShowcase
        reverse
        eyebrow="Swing Analysis"
        eyebrowIcon={PlayCircle}
        title="Personalized swing reviews"
        description="Upload a swing video and get detailed feedback from your Coach — frame by frame, with notes you can revisit anytime."
        bullets={[
          'Send a video in seconds from your phone',
          'Get coach feedback you can replay forever',
          'Track your technique evolve over time',
        ]}
        image={mockupVideo}
        imageAlt="Video swing analysis with coach feedback on iPhone"
      />
      <FeatureShowcase
        eyebrow="Booking"
        eyebrowIcon={Calendar}
        title="Book lessons in seconds"
        description="Pick a time that works. Members lock in a recurring weekly Priority Spot — same day, same time, every week."
        bullets={[
          'Live availability — no back-and-forth',
          'Priority Spot reserved exclusively for members',
          'Reminders so you never miss a lesson',
        ]}
        image={mockupBooking}
        imageAlt="Lesson booking with Priority Spot on iPhone"
      />
      <FeatureShowcase
        reverse
        eyebrow="Progress"
        eyebrowIcon={BarChart3}
        title="See your progress"
        description="Log rounds, track your handicap, and earn SC Points for every lesson and milestone — redeemable for rewards."
        bullets={[
          'Round stats: score, GIR, FIR, putts',
          'Handicap trend at a glance',
          'Earn SC Points and unlock rewards',
        ]}
        image={mockupStats}
        imageAlt="Progress, stats and SC Points on iPhone"
      />
    </div>
  );
}