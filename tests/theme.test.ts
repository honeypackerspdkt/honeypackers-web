import { describe, expect, it } from 'vitest';
import { PRESETS, brandColor, whiteContrast } from '../src/lib/theme';

describe('brand colour', () => {
  it('defaults to the logo brown and accepts presets and hex', () => {
    expect(brandColor(undefined)).toBe('#8a3404');
    expect(brandColor('Forest')).toBe(PRESETS.forest);
    expect(brandColor('#1f6f6b')).toBe('#1f6f6b');
    expect(brandColor('#abc')).not.toBe(''); // short hex accepted
    expect(brandColor('not a colour')).toBe('#8a3404');
  });
  it('every preset and any chosen colour keeps white button text readable', () => {
    for (const c of Object.values(PRESETS)) expect(whiteContrast(c)).toBeGreaterThanOrEqual(4.5);
    for (const c of ['#ffd400', '#7fffd4', '#ff8800', '#ffffff']) expect(whiteContrast(brandColor(c))).toBeGreaterThanOrEqual(4.5);
  });
});
