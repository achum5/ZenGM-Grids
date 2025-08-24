// Fisher-Yates shuffle for uniform sampling
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sampleUniform<T>(arr: T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n);
}