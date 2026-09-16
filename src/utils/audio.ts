export function dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
}
export function linearToDb(linear: number): number {
    return 20 * Math.log10(linear);
}
