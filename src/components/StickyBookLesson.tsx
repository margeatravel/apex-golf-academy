import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { InternalBookingModal } from '@/components/InternalBookingModal';

export function StickyBookLesson() {
  // Replaced by the new Oura-style StudentBottomNav, which exposes a dedicated
  // "Book" entry. Kept as a no-op export so existing imports keep compiling.
  return null;
}
