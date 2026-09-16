import { test, expect } from 'vitest';
import { dbToLinear, linearToDb } from './audio';

test('db to linear', () => {
    expect(dbToLinear(0)).toBeCloseTo(1);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(dbToLinear(-12)).toBeCloseTo(0.251, 3);
});
test('linear to db', () => {
    expect(linearToDb(1)).toBeCloseTo(0);
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 2);
});
