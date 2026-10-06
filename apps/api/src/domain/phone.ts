// Numéros béninois. Depuis le 30 novembre 2024, les numéros mobiles ont 10 chiffres :
// on a ajouté « 01 » devant les anciens numéros à 8 chiffres.

export function normalizeBeninPhone(input: string): string | null {
  let digits = input.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+229')) digits = digits.slice(4);
  else if (digits.startsWith('00229')) digits = digits.slice(5);
  else if (digits.startsWith('229') && (digits.length === 11 || digits.length === 13)) digits = digits.slice(3);

  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 8) return `01${digits}`;
  if (digits.length === 10 && digits.startsWith('01')) return digits;
  return null;
}

// « 0197123456 » -> « 01 97 12 34 56 »
export function formatBeninPhone(phone: string): string {
  return phone.replace(/(\d{2})(?=\d)/g, '$1 ');
}

// Numéro international sans « + », pour les liens wa.me.
export function toWhatsAppNumber(phone: string): string {
  return `229${phone}`;
}
