import { describe, expect, test } from 'bun:test';
import { roundHandicapEstimate } from '../src/lib/roundHandicapEstimate';

const round = (id: string, score: number, holes = 18, par = 72) => ({ id, played_on: `2026-10-${id.padStart(2, '0')}`, total_score: score, holes_played: holes, course_par: par });
describe('separate round handicap estimate', () => {
  test('uploaded rounds determine chronological estimate and change, not manual handicap', () => {
    const points = roundHandicapEstimate([round('2', 92), round('1', 102)]);
    expect(points.map(p => p.handicap)).toEqual([30, 25]);
    expect(points[1].handicap - points[0].handicap).toBe(-5);
  });
  test('9-hole scores normalize to 18 holes, including legacy full-course par', () => {
    expect(roundHandicapEstimate([round('1', 49, 9, 36)])[0].handicap).toBe(26);
    expect(roundHandicapEstimate([round('1', 49, 9, 72)])[0].handicap).toBe(26);
  });
  test('uses only latest 20 valid rounds and does not mutate input', () => {
    const input = Array.from({ length: 21 }, (_, i) => round(String(i + 1), i === 0 ? 172 : 92));
    expect(roundHandicapEstimate(input).at(-1)?.handicap).toBe(20);
    expect(input[0].total_score).toBe(172);
  });
  test('empty or invalid rounds do not invent an estimate', () => {
    expect(roundHandicapEstimate([])).toEqual([]);
    expect(roundHandicapEstimate([round('1', 0), round('2', 90, 0)])).toEqual([]);
  });
});