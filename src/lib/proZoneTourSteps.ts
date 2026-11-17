import type { DriveStep } from 'driver.js';

const popoverClass = 'sc-tour-popover';

type T = (key: string) => string;

export const getProZoneSteps = (t: T): DriveStep[] => [
  {
    popover: {
      title: t('prozone.tourWelcomeTitle'),
      description: t('prozone.tourWelcomeDesc').replace('{coach}', t('common.yourCoach')),
      popoverClass,
      showButtons: ['next', 'close'],
      nextBtnText: t('prozone.tourTakeTour'),
      doneBtnText: t('prozone.tourTakeTour'),
    },
  },
  {
    element: '[data-tour="pro-zone-categories"]',
    popover: {
      title: t('prozone.tourLibraryTitle'),
      description: t('prozone.tourLibraryDesc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="pro-zone-first-tip"]',
    popover: {
      title: t('prozone.tourMarkCompleteTitle'),
      description: t('prozone.tourMarkCompleteDesc'),
      popoverClass,
      side: 'bottom',
      align: 'center',
    },
  },
  {
    popover: {
      title: t('prozone.tourFreshContentTitle'),
      description: t('prozone.tourFreshContentDesc'),
      popoverClass,
    },
  },
];

// Backwards-compat identity export using English defaults.
const identity: T = (k) => (k === 'common.yourCoach' ? 'your Coach' : k);
export const proZoneSteps: DriveStep[] = getProZoneSteps(identity);
