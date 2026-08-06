import {describe, expect, it} from 'vitest';
import {findNearbyCulturalDates} from '../src/ai/festival-context';

describe('nearby cultural dates', () => {
  it('finds a nearby solar term and international observance', () => {
    const result = findNearbyCulturalDates(new Date('2026-08-06T04:00:00Z'));
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: '立秋', kind: '二十四节气', offsetDays: 1}),
      ]),
    );
  });

  it('finds lunar festivals without a year-specific table', () => {
    const result = findNearbyCulturalDates(new Date('2026-02-17T04:00:00Z'), 0);
    expect(result).toEqual([
      {name: '春节', kind: '农历节日', date: '2026-02-17', offsetDays: 0},
    ]);
  });
});
