/** Identificador único, ordenable aproximadamente por fecha de creación. */
export function createId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 18);
  return `${prefix}${time}${rand}`;
}
