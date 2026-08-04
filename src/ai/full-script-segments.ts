export const recommendedStoryboardCount = (durationSeconds = 120): number =>
  Math.max(3, Math.min(20, Math.ceil(durationSeconds / 10)));

export const splitFullScript = (text: string, desiredSegments: number): string[] => {
  const normalized = text.trim().replace(/\r\n?/g, '\n');
  if (!normalized) return [];
  const target = Math.max(1, desiredSegments);
  let units = normalized
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  while (units.length < target) {
    const longestIndex = units.reduce(
      (best, item, index) =>
        Array.from(item).length > Array.from(units[best] ?? '').length ? index : best,
      0,
    );
    const longest = units[longestIndex];
    if (!longest || Array.from(longest).length < 2) break;
    const characters = Array.from(longest);
    const preferred = Math.floor(characters.length / 2);
    const nearbyBoundary = characters.findIndex(
      (character, index) => index >= preferred && /[，、：,]/u.test(character),
    );
    const splitAt = nearbyBoundary >= 0 ? nearbyBoundary + 1 : preferred;
    units.splice(
      longestIndex,
      1,
      characters.slice(0, splitAt).join(''),
      characters.slice(splitAt).join(''),
    );
  }

  if (units.length <= target) return units;

  const segmentCount = Math.min(target, units.length);
  const segments: string[] = [];
  let cursor = 0;
  for (let segmentIndex = 0; segmentIndex < segmentCount - 1; segmentIndex += 1) {
    const remainingSegments = segmentCount - segmentIndex;
    const remainingCharacters = units
      .slice(cursor)
      .reduce((sum, item) => sum + Array.from(item).length, 0);
    const idealSize = remainingCharacters / remainingSegments;
    const maximumEnd = units.length - (remainingSegments - 1);
    let bestEnd = cursor + 1;
    let accumulated = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let end = cursor + 1; end <= maximumEnd; end += 1) {
      accumulated += Array.from(units[end - 1] ?? '').length;
      const distance = Math.abs(accumulated - idealSize);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnd = end;
      }
      if (accumulated >= idealSize && distance > bestDistance) break;
    }
    segments.push(units.slice(cursor, bestEnd).join(''));
    cursor = bestEnd;
  }
  segments.push(units.slice(cursor).join(''));
  return segments;
};
