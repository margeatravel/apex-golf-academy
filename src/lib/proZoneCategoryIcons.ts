import {
  Hand,
  Zap,
  Target,
  Wind,
  Swords,
  Repeat,
  Waves,
  BarChart3,
  Map,
  Dumbbell,
  Brain,
  RotateCcw,
  Compass,
  MoveRight,
  PersonStanding,
  Trophy,
  Flag,
  type LucideIcon,
} from 'lucide-react';

/**
 * Lucide icon per Pro Zone category key. Replaces the legacy emoji icons in the
 * member-facing library grid. Unknown/custom sections fall back to a flag.
 */
export const PRO_ZONE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  grip: Hand,
  release: Zap,
  putt: Target,
  driver: Wind,
  irons: Swords,
  transition: Repeat,
  bunker: Waves,
  scoring_stats: BarChart3,
  course_management: Map,
  mobility_gym: Dumbbell,
  mental_game: Brain,
  backswing: RotateCcw,
  club_face_alignment: Compass,
  club_path_alignment: MoveRight,
  address_body_alignment: PersonStanding,
  tour_pros: Trophy,
};

export const getProZoneCategoryIcon = (key: string): LucideIcon =>
  PRO_ZONE_CATEGORY_ICONS[key] ?? Flag;
