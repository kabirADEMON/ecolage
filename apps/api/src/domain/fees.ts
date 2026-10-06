// Règles de l'échéancier, sans base de données.

export type PlanItem = { id: string; label: string; amount: number; dueDate: string; position: number };

export type InstallmentStatus = 'paid' | 'partial' | 'due' | 'overdue';

export type ScheduleLine = PlanItem & {
  // Montant après réduction.
  net: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
};

export type FeeSummary = {
  totalGross: number;
  discount: number;
  totalNet: number;
  totalPaid: number;
  // Reste à payer. Négatif : l'élève a une avance.
  balance: number;
  overdueAmount: number;
  nextDue: { label: string; dueDate: string; remaining: number } | null;
  state: 'settled' | 'late' | 'on_track';
  schedule: ScheduleLine[];
};

// La réduction est retirée en partant de la dernière tranche : l'inscription et les
// premières tranches restent dues en entier, comme le pratiquent les écoles.
export function applyDiscount(plan: readonly PlanItem[], discount: number): (PlanItem & { net: number })[] {
  const sorted = [...plan].sort((a, b) => a.position - b.position);
  let left = Math.max(0, discount);
  const nets = new Array<number>(sorted.length);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const cut = Math.min(left, sorted[i]!.amount);
    nets[i] = sorted[i]!.amount - cut;
    left -= cut;
  }
  return sorted.map((item, i) => ({ ...item, net: nets[i]! }));
}

// Les paiements soldent les tranches dans l'ordre (inscription d'abord).
export function summarizeFees(
  plan: readonly PlanItem[],
  discount: number,
  totalPaid: number,
  today: string,
): FeeSummary {
  const lines = applyDiscount(plan, discount);
  let pool = totalPaid;
  let overdueAmount = 0;
  let nextDue: FeeSummary['nextDue'] = null;

  const schedule: ScheduleLine[] = lines.map((line) => {
    const paid = Math.min(pool, line.net);
    pool -= paid;
    const remaining = line.net - paid;
    let status: InstallmentStatus;
    if (remaining === 0) status = 'paid';
    else if (line.dueDate < today) status = 'overdue';
    else if (paid > 0) status = 'partial';
    else status = 'due';
    if (status === 'overdue') overdueAmount += remaining;
    if (remaining > 0 && line.dueDate >= today && !nextDue) {
      nextDue = { label: line.label, dueDate: line.dueDate, remaining };
    }
    return { ...line, paid, remaining, status };
  });

  const totalGross = plan.reduce((s, i) => s + i.amount, 0);
  const totalNet = lines.reduce((s, i) => s + i.net, 0);
  const balance = totalNet - totalPaid;
  return {
    totalGross,
    discount: totalGross - totalNet,
    totalNet,
    totalPaid,
    balance,
    overdueAmount,
    nextDue,
    state: balance <= 0 ? 'settled' : overdueAmount > 0 ? 'late' : 'on_track',
    schedule,
  };
}

// --- Montant en toutes lettres (reçus) ------------------------------------------

const UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n: number): string {
  if (n < 20) return UNITS[n]!;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t]!;
    return `${TENS[t]}${u === 1 ? '-et-un' : `-${UNITS[u]}`}`;
  }
  if (n < 80) return n === 71 ? 'soixante-et-onze' : `soixante-${UNITS[n - 60]}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${UNITS[n - 80]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return below100(rest);
  const hundreds = h === 1 ? 'cent' : `${UNITS[h]}-cent${rest === 0 ? 's' : ''}`;
  return rest === 0 ? hundreds : `${hundreds}-${below100(rest)}`;
}

// Orthographe rectifiée de 1990 : tous les nombres composés sont reliés par des traits d'union.
export function amountInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error('Montant invalide');
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (billions) parts.push(`${below1000(billions)}-milliard${billions > 1 ? 's' : ''}`);
  if (millions) parts.push(`${below1000(millions)}-million${millions > 1 ? 's' : ''}`);
  if (thousands) {
    // « mille » est invariable, et « quatre-vingts » / « deux-cents » perdent leur s devant lui.
    const t = thousands === 1 ? '' : `${below1000(thousands).replace(/(vingt|cent)s$/, '$1')}-`;
    parts.push(`${t}mille`);
  }
  if (rest) parts.push(below1000(rest));
  return parts.join('-');
}
