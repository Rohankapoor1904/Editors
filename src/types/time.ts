export interface RationalTime {
  value: number;
  rate: number; // e.g. 24000, 30000, 60000, etc.
}

export function createRational(value: number, rate: number): RationalTime {
  if (rate === 0) {
      throw new Error("Rational time rate cannot be zero");
  }
  return { value, rate };
}

// Ensure the fraction is in its simplest form to avoid overflowing Number.MAX_SAFE_INTEGER
function simplify(time: RationalTime): RationalTime {
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  };

  const divisor = gcd(time.value, time.rate);
  if (divisor === 0) return time;
  return { value: time.value / divisor, rate: time.rate / divisor };
}

export function addRational(a: RationalTime, b: RationalTime): RationalTime {
  const commonRate = a.rate * b.rate;
  const aValue = a.value * b.rate;
  const bValue = b.value * a.rate;
  return simplify({ value: aValue + bValue, rate: commonRate });
}

export function subRational(a: RationalTime, b: RationalTime): RationalTime {
  const commonRate = a.rate * b.rate;
  const aValue = a.value * b.rate;
  const bValue = b.value * a.rate;
  return simplify({ value: aValue - bValue, rate: commonRate });
}

export function compareRational(a: RationalTime, b: RationalTime): number {
  const diff = subRational(a, b);
  return diff.value; // > 0 if a > b, < 0 if a < b, 0 if a == b
}

export function rationalToFrames(time: RationalTime, fps: number): number {
  // time in seconds is time.value / time.rate
  // frames = timeInSeconds * fps
  return Math.round((time.value * fps) / time.rate);
}

export function rationalToSeconds(time: RationalTime): number {
  return time.value / time.rate;
}

export function secondsToRational(seconds: number, rate: number = 60000): RationalTime {
  return simplify({ value: Math.round(seconds * rate), rate });
}
