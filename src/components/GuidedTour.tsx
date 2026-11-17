import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { getStudentSteps, getCoachSteps, getProZoneSteps, studentSteps } from '@/lib/tourSteps';

const FORCE_TOUR_QUERY = 'tour';
const TOUR_WAIT_TIMEOUT_MS = 5000;
const TOUR_POLL_MS = 150;
const REPLAY_TOUR_EVENT = 'sc:replay-tour';

const waitForTourTargets = async (steps: typeof studentSteps) => {
  const selectors = steps
    .map((step) => step.element)
    .filter((selector): selector is string => typeof selector === 'string');

  if (selectors.length === 0) return;

  const startedAt = Date.now();

  while (Date.now() - startedAt < TOUR_WAIT_TIMEOUT_MS) {
    // Resolve as soon as at least one anchor is in the DOM. Missing anchors
    // (e.g. elements hidden on the current breakpoint) are filtered out later
    // via `availableSteps`, so we don't need to block the full timeout.
    const anyReady = selectors.some((selector) => document.querySelector(selector));
    if (anyReady) {
      // Give the layout one more frame to settle so positioning is accurate.
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, TOUR_POLL_MS));
  }
};

const getCleanPath = (pathname: string) => pathname.replace(/\/$/, '') || '/';

/**
 * Self-gating guided tour. Mounts once at the app root and:
 *  - waits for an authenticated profile
 *  - starts only on /dashboard (student) or /admin (coach)
 *  - skips users who already have profile.tour_completed_at set
 *  - persists the completion timestamp on done/skip
 */
export function GuidedTour() {
  const { user, profile, role } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const suppressPersistRef = useRef(false);
  const forceReplayRef = useRef(false);
  const [forceTick, setForceTick] = useState(0);

  // Listen for in-app replay requests (no page reload).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: 'coach' | 'student' | 'proZone' }>).detail || {};
      const targetPath =
        detail.view === 'coach'
          ? '/admin'
          : detail.view === 'proZone'
          ? '/pro-zone'
          : '/dashboard';
      startedRef.current = false;
      driverRef.current?.destroy();
      driverRef.current = null;
      forceReplayRef.current = true;
      if (location.pathname !== targetPath) {
        navigate(`${targetPath}?${FORCE_TOUR_QUERY}=1`);
      } else {
        // Same page: bump tick to re-run the effect with force flag.
        const params = new URLSearchParams(window.location.search);
        params.set(FORCE_TOUR_QUERY, '1');
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        setForceTick((n) => n + 1);
      }
    };
    window.addEventListener(REPLAY_TOUR_EVENT, handler as EventListener);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, handler as EventListener);
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!user || !profile) return;
    if (startedRef.current) return;

    const pathname = getCleanPath(location.pathname);
    const searchParams = new URLSearchParams(location.search);
    const urlForce = searchParams.get(FORCE_TOUR_QUERY) === '1'
      || new URLSearchParams(window.location.search).get(FORCE_TOUR_QUERY) === '1';
    const forceStart = urlForce || forceReplayRef.current;
    forceReplayRef.current = false;

    const isStudentLanding = pathname === '/dashboard';
    const isCoachLanding = pathname === '/admin' && role === 'admin';
    const isProZoneLanding = pathname === '/pro-zone';
    if (!isStudentLanding && !isCoachLanding && !isProZoneLanding) return;

    // Pro Zone tour uses its own completion field; main tour uses tour_completed_at.
    const tourDone = isProZoneLanding
      ? (profile as any).pro_zone_tour_completed_at
      : (profile as any).tour_completed_at;
    if (tourDone && !forceStart) return;

    startedRef.current = true;

    const steps = isCoachLanding
      ? getCoachSteps(t)
      : isProZoneLanding
      ? getProZoneSteps(t)
      : getStudentSteps(t);

    const clearForcedQuery = () => {
      if (!forceStart) return;
      const params = new URLSearchParams(window.location.search);
      params.delete(FORCE_TOUR_QUERY);
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    };

    const markComplete = async () => {
      if (suppressPersistRef.current) return;
      clearForcedQuery();
      try {
        const updateField = isProZoneLanding
          ? { pro_zone_tour_completed_at: new Date().toISOString() }
          : { tour_completed_at: new Date().toISOString() };
        await supabase
          .from('profiles')
          .update(updateField as any)
          .eq('id', user.id);
      } catch (err) {
        console.warn('Failed to persist tour completion', err);
      } finally {
        driverRef.current = null;
      }
    };

    let cancelled = false;

    const startTour = async () => {
      await waitForTourTargets(steps);
      if (cancelled) return;

      const availableSteps = steps.filter((step) => typeof step.element !== 'string' || !!document.querySelector(step.element));
      if (availableSteps.length === 0) {
        startedRef.current = false;
        clearForcedQuery();
        return;
      }

      let driverObj: ReturnType<typeof driver>;
      let destroying = false;

      const closeTour = () => {
        if (destroying) return;
        destroying = true;
        clearForcedQuery();
        driverObj.destroy();
        void markComplete();
      };

      const wiredSteps = availableSteps.map((step, index) => {
        const isLastStep = index === availableSteps.length - 1;
        if (!isLastStep) return step;

        return {
          ...step,
          popover: {
            ...step.popover,
            onNextClick: closeTour,
            onCloseClick: closeTour,
          },
        };
      });

      driverObj = driver({
        showProgress: true,
        allowClose: true,
        animate: true,
        smoothScroll: true,
        overlayOpacity: 0.65,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'sc-tour-popover',
        nextBtnText: t('tour.buttons.next'),
        prevBtnText: t('tour.buttons.back'),
        doneBtnText: t('tour.buttons.done'),
        steps: wiredSteps,
        onPopoverRender: (popover) => {
          // driver.js v1 does not always wire the close (X) button to fire
          // onCloseClick reliably across all steps — bind it ourselves so
          // the X always tears down the tour.
          const closeBtn = popover.wrapper?.querySelector('.driver-popover-close-btn');
          if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              closeTour();
            });
          }
        },
        onDestroyStarted: () => {
          // Fired by ESC / overlay click. Tear down + persist completion.
          if (destroying) return;
          destroying = true;
          driverObj.destroy();
          void markComplete();
        },
      });

      suppressPersistRef.current = false;
      driverRef.current = driverObj;
      driverObj.drive();
    };

    void startTour();

    return () => {
      cancelled = true;
      suppressPersistRef.current = true;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [user, profile, role, location.pathname, location.search, forceTick, t, language]);

  return null;
}

/** Imperative helper for "Replay tour" menu items. */
export async function replayTour(userId: string, view: 'coach' | 'student' | 'proZone') {
  // Clear completion flag (best-effort) and trigger an in-app start — no reload.
  const clearField =
    view === 'proZone'
      ? { pro_zone_tour_completed_at: null }
      : { tour_completed_at: null };
  void supabase.from('profiles').update(clearField as any).eq('id', userId);

  window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT, { detail: { view } }));
}
