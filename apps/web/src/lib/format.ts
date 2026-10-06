const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// « 7 500 F ». Intl sépare les milliers par une espace fine, presque invisible en gras :
// on la remplace par une espace insécable normale, plus lisible.
export function money(amount: number): string {
  return `${number.format(amount).replace(/\u202F/g, '\u00A0')}\u00A0F`;
}

export function phone(value: string | null): string {
  return value ? value.replace(/(\d{2})(?=\d)/g, '$1 ') : '';
}

// Saisie libre -> numéro béninois à 10 chiffres, ou null si invalide (même règle que l'API).
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+229')) d = d.slice(4);
  else if (d.startsWith('00229')) d = d.slice(5);
  else if (d.startsWith('229') && (d.length === 11 || d.length === 13)) d = d.slice(3);
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 8) return `01${d}`;
  if (d.length === 10 && d.startsWith('01')) return d;
  return null;
}

const TZ = 'Africa/Porto-Novo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const today = () => dayFmt.format(new Date());
export const isoDay = (d: Date) => dayFmt.format(d);

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dateLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: TZ });
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

// Date d'échéance (AAAA-MM-JJ) : « aujourd'hui », « demain », « 12 mars ».
export function dueLabel(day: string): string {
  const t = today();
  if (day === t) return 'aujourd’hui';
  if (day === addDays(t, 1)) return 'demain';
  if (day === addDays(t, -1)) return 'hier';
  return dateLong.format(new Date(`${day}T12:00:00Z`));
}

export function daysLate(day: string): number {
  return Math.round((Date.parse(`${today()}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
}

// Horodatage d'une opération : « Aujourd’hui · 14:05 », « Hier · 09:12 », « 3 févr. · 18:40 ».
export function when(iso: string): string {
  const d = new Date(iso);
  const day = isoDay(d);
  const t = today();
  const label = day === t ? 'Aujourd’hui' : day === addDays(t, -1) ? 'Hier' : dateShort.format(d);
  return `${label} · ${time.format(d)}`;
}

export function relativeDay(iso: string | null): string {
  if (!iso) return 'Aucune opération';
  const day = isoDay(new Date(iso));
  const t = today();
  if (day === t) return 'Aujourd’hui';
  if (day === addDays(t, -1)) return 'Hier';
  const n = daysLate(day);
  if (n < 7) return `Il y a ${n} jours`;
  return `Le ${dateShort.format(new Date(iso))}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}\u00A0%`;
}

export const METHOD_LABEL = { cash: 'Espèces', momo: 'Mobile Money', bank: 'Virement / chèque' } as const;

export const STATUS_LABEL = {
  paid: 'Payée',
  partial: 'Entamée',
  due: 'À venir',
  overdue: 'En retard',
} as const;

export const STATE_LABEL = { settled: 'Soldé', late: 'En retard', on_track: 'À jour' } as const;

const dateFull = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Porto-Novo',
});
const timeOnly = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Porto-Novo',
});

// « 6 octobre 2026 à 10:42 »
export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${dateFull.format(d)} à ${timeOnly.format(d)}`;
}

export function longDay(day: string): string {
  return dateFull.format(new Date(`${day}T12:00:00+01:00`));
}
