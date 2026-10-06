import { dueLabel, money } from './format';
import type { School, StudentDetail } from './types';

export function portalUrl(token: string): string {
  return `${window.location.origin}/p/${token}`;
}

// Rappel courtois au parent, avec le lien du portail (échéancier, reçus, paiement).
export function reminderMessage(school: School, detail: StudentDetail): string {
  const { student: s, summary } = detail;
  const child = `${s.firstName} ${s.lastName}`;
  const lines = [`Bonjour ${s.parentName},`, ''];
  if (summary.overdueAmount > 0) {
    lines.push(
      `${school.name} vous rappelle que ${money(summary.overdueAmount)} de la scolarité de ${child} (${s.className}) sont arrivés à échéance.`,
    );
  } else if (summary.nextDue) {
    lines.push(
      `${school.name} vous rappelle la prochaine échéance de la scolarité de ${child} (${s.className}) : ${money(summary.nextDue.remaining)} d’ici ${dueLabel(summary.nextDue.dueDate)}.`,
    );
  } else {
    lines.push(`Voici le suivi de la scolarité de ${child} (${s.className}) à ${school.name}.`);
  }
  lines.push(
    `Reste à payer sur l’année : ${money(Math.max(summary.balance, 0))}.`,
    '',
    `Échéancier, reçus et paiement Mobile Money : ${portalUrl(s.shareToken)}`,
    '',
    'Merci de votre confiance.',
  );
  return lines.join('\n');
}

export function receiptMessage(school: School, detail: StudentDetail, receiptNumber: number, amount: number): string {
  const s = detail.student;
  return [
    `Bonjour ${s.parentName},`,
    '',
    `${school.name} confirme la réception de ${money(amount)} pour la scolarité de ${s.firstName} ${s.lastName} (reçu n° ${receiptNumber}).`,
    `Reste à payer : ${money(Math.max(detail.summary.balance, 0))}.`,
    '',
    `Vos reçus : ${portalUrl(s.shareToken)}`,
  ].join('\n');
}

export function whatsappLink(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/229${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
