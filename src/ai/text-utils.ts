export const tokenizeCaption = (text: string): string[] =>
  text.match(/[\p{Script=Han}]{1,2}|[A-Za-z0-9]+|[^\s]/gu) ?? [text];

export const distributeWords = (
  text: string,
  duration: number,
): {text: string; start: number; end: number}[] => {
  const tokens = tokenizeCaption(text);
  const weights = tokens.map((token) => Math.max(1, [...token].length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return tokens.map((token, index) => {
    const length = duration * ((weights[index] ?? 1) / total);
    const word = {text: token, start: cursor, end: Math.min(duration, cursor + length)};
    cursor += length;
    return word;
  });
};
