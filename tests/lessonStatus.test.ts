import { describe, expect, test } from 'bun:test';
import { isEffectivelyTaken } from '../src/lib/lessonStatus';

describe('completed student lesson history', () => {
  test('Ivan’s October 22 and October 30 lessons both qualify on October 30 in Cancún', () => {
    const lessons = [
      { lesson_date: '2026-10-22', status: 'completed' },
      { lesson_date: '2026-10-30', status: 'completed' },
    ];
    expect(lessons.filter((lesson) => isEffectivelyTaken(lesson, '2026-10-30'))).toHaveLength(2);
  });
  test('future and scheduled lessons do not qualify as taken', () => {
    expect(isEffectivelyTaken({ lesson_date: '2026-11-06', status: 'completed' }, '2026-10-30')).toBe(false);
    expect(isEffectivelyTaken({ lesson_date: '2026-10-30', status: 'scheduled' }, '2026-10-30')).toBe(false);
  });
});