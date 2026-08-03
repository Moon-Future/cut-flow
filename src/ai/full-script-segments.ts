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
  const totalCharacters = units.reduce((sum, item) => sum + Array.from(item).length, 0);
  const targetSize = totalCharacters / segmentCount;
  const segments: string[] = [];
  let current = '';
  for (const unit of units) {
    const remainingUnits = units.length - units.indexOf(unit);
    const remainingSegments = segmentCount - segments.length;
    if (
      current &&
      segments.length < segmentCount - 1 &&
      Array.from(current + unit).length > targetSize &&
      remainingUnits >= remainingSegments
    ) {
      segments.push(current);
      current = unit;
    } else {
      current += unit;
    }
  }
  if (current) segments.push(current);
  return segments;
};
