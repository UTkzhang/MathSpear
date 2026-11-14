/**
 * Independent parser for the display text ("2+(24÷2)×5"), used only by tests
 * to check that what the player sees evaluates to the stored answer.
 */
export function evaluateText(text: string): number {
  const tokens = text.match(/\d+|[+−×÷()]/g) ?? [];
  if (tokens.join('') !== text) throw new Error(`Unexpected characters in "${text}"`);
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  const factor = (): number => {
    const t = take();
    if (t === '(') {
      const v = expr();
      if (take() !== ')') throw new Error(`Missing ) in "${text}"`);
      return v;
    }
    if (t !== undefined && /^\d+$/.test(t)) return Number(t);
    throw new Error(`Unexpected token "${t}" in "${text}"`);
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '×' || peek() === '÷') v = take() === '×' ? v * factor() : v / factor();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '−') v = take() === '+' ? v + term() : v - term();
    return v;
  };

  const v = expr();
  if (i !== tokens.length) throw new Error(`Trailing tokens in "${text}"`);
  return v;
}
