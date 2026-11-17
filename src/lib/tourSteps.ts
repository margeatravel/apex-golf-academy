import type { DriveStep } from 'driver.js';

const popoverClass = 'sc-tour-popover';

export { proZoneSteps, getProZoneSteps } from './proZoneTourSteps';

type T = (key: string) => string;

export const getStudentSteps = (t: T): DriveStep[] => [
  {
    popover: {
      title: t('tour.student.welcome.title'),
      description: t('tour.student.welcome.desc'),
      popoverClass,
      showButtons: ['next', 'close'],
      nextBtnText: t('tour.buttons.start'),
      doneBtnText: t('tour.buttons.start'),
    },
  },
  {
    element: '[data-tour="greeting-plan"]',
    popover: {
      title: t('tour.student.greeting.title'),
      description: t('tour.student.greeting.desc'),
      popoverClass,
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="next-lesson"]',
    popover: {
      title: t('tour.student.nextLesson.title'),
      description: t('tour.student.nextLesson.desc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="pro-zone"]',
    popover: {
      title: t('tour.student.proZone.title'),
      description: t('tour.student.proZone.desc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="apex-ai"]',
    popover: {
      title: t('tour.student.apexAi.title'),
      description: t('tour.student.apexAi.desc'),
      popoverClass,
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="manage-plan"]',
    popover: {
      title: t('tour.student.managePlan.title'),
      description: t('tour.student.managePlan.desc'),
      popoverClass,
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="swing-analysis"]',
    popover: {
      title: t('tour.student.purchases.title'),
      description: t('tour.student.purchases.desc'),
      popoverClass,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="sc-points"]',
    popover: {
      title: t('tour.student.scPoints.title'),
      description: t('tour.student.scPoints.desc'),
      popoverClass,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="install-app"]',
    popover: {
      title: t('tour.student.install.title'),
      description: t('tour.student.install.desc'),
      popoverClass,
      side: 'bottom',
      align: 'end',
    },
  },
  {
    popover: {
      title: t('tour.student.closing.title'),
      description: t('tour.student.closing.desc'),
      popoverClass,
    },
  },
];

export const getCoachSteps = (t: T): DriveStep[] => [
  {
    popover: {
      title: t('tour.coach.welcome.title'),
      description: t('tour.coach.welcome.desc'),
      popoverClass,
      showButtons: ['next', 'close'],
      nextBtnText: t('tour.buttons.start'),
      doneBtnText: t('tour.buttons.start'),
    },
  },
  {
    element: '[data-tour="calendar-hero"]',
    popover: {
      title: t('tour.coach.calendar.title'),
      description: t('tour.coach.calendar.desc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="stat-grid"]',
    popover: {
      title: t('tour.coach.pulse.title'),
      description: t('tour.coach.pulse.desc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="recurring-card"]',
    popover: {
      title: t('tour.coach.recurring.title'),
      description: t('tour.coach.recurring.desc'),
      popoverClass,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="coach-nav"]',
    popover: {
      title: t('tour.coach.nav.title'),
      description: t('tour.coach.nav.desc'),
      popoverClass,
      side: 'bottom',
      align: 'end',
    },
  },
  {
    popover: {
      title: t('tour.coach.closing.title'),
      description: t('tour.coach.closing.desc'),
      popoverClass,
    },
  },
];

// Backwards-compat: some imports may still reference these symbols.
// They render with the EN dictionary only — prefer the factories above.
const identity: T = (k) => k;
export const studentSteps = getStudentSteps(identity);
export const coachSteps = getCoachSteps(identity);
