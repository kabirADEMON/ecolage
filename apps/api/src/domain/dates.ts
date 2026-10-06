// Le Bénin vit à UTC+1 toute l'année. Les échéances sont des dates locales (AAAA-MM-JJ).
export const TIMEZONE = 'Africa/Porto-Novo';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function localDay(date: Date = new Date()): string {
  return dayFormat.format(date);
}

export function localMonth(date: Date = new Date()): string {
  return localDay(date).slice(0, 7);
}
