import { devices, expect, test, type Page } from '@playwright/test';

// Une rentrée complète : la directrice installe l'école, un caissier encaisse,
// un parent paie depuis son téléphone, la directrice contrôle la caisse.
test.describe.configure({ mode: 'serial' });

const DIRECTOR_PHONE = `01${String(Date.now()).slice(-8)}`;
const PASSWORD = 'ecole2026';
let cashierPhone = '';
let cashierPassword = '';
let portalUrl = '';

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(() => page.close());

const nav = (name: string) => page.getByRole('complementary', { name: 'Navigation' }).getByRole('link', { name });

test('la directrice crée l’espace de son école', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('La scolarité de votre école');
  await page.getByRole('link', { name: 'Créer l’espace de mon école' }).click();
  await page.getByLabel('Nom de l’école').fill('Complexe scolaire Les Palmiers');
  await page.getByLabel('Ville').fill('Cotonou');
  await page.getByLabel('Votre nom').fill('Mme Adjovi');
  await page.getByLabel('Votre téléphone').fill(DIRECTOR_PHONE);
  await page.getByLabel('Mot de passe').fill('motdepasse');
  await page.getByRole('button', { name: 'Créer l’espace de l’école' }).click();
  await expect(page.getByText('Mélangez des lettres et des chiffres.')).toBeVisible();
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer l’espace de l’école' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Votre école est prête')).toBeVisible();
});

test('elle crée une classe avec son échéancier', async () => {
  await page.getByRole('link', { name: 'Créer les classes' }).click();
  await page.getByRole('button', { name: 'Créer la première classe' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nouvelle classe' });
  await sheet.getByLabel('Nom de la classe').fill('CM2');
  await sheet.getByLabel('Montant').nth(0).fill('20000');
  await sheet.getByLabel('Montant').nth(1).fill('50000');
  await sheet.getByLabel('Montant').nth(2).fill('40000');
  await sheet.getByRole('button', { name: 'Retirer Tranche 3' }).click();
  await expect(sheet.getByText(/Total annuel : 110\s000\sF/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Créer la classe' }).click();

  await expect(page.getByText('Classe CM2 créée')).toBeVisible();
  const row = page.getByRole('table', { name: 'Classes' }).getByRole('row', { name: /CM2/ });
  await expect(row).toContainText(/110\s000\sF/);
});

test('elle inscrit un élève et encaisse l’inscription', async () => {
  await nav('Élèves').click();
  await page.getByRole('button', { name: 'Inscrire' }).click();
  const sheet = page.getByRole('dialog', { name: 'Inscrire un élève' });
  await sheet.getByLabel('Nom', { exact: true }).fill('Houngbo');
  await sheet.getByLabel('Prénom(s)').fill('Afi');
  await sheet.getByLabel('Parent ou tuteur').fill('M. Houngbo');
  await sheet.getByLabel('WhatsApp du parent').fill('97 12 34 56');
  await sheet.getByLabel('Réduction accordée (facultatif)').fill('10000');
  await sheet.getByRole('button', { name: 'Inscrire l’élève' }).click();

  await expect(page.getByRole('heading', { name: 'HOUNGBO Afi' })).toBeVisible();
  await expect(page.getByText(/Matricule \d{2}-0001/)).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText(/100\s000\sF/);

  await page.getByRole('main').getByRole('button', { name: 'Encaisser' }).click();
  const collect = page.getByRole('dialog', { name: /Encaisser · Afi/ });
  await collect.getByLabel('Montant reçu en francs CFA').fill('20000');
  await collect.getByRole('button', { name: /Encaisser 20\s000\sF/ }).click();

  const done = page.getByRole('dialog', { name: 'Paiement enregistré' });
  await expect(done.getByTestId('receipt-done')).toContainText('Reçu n° 1');
  const wa = await done.getByRole('link', { name: 'Envoyer au parent' }).getAttribute('href');
  expect(wa).toMatch(/^https:\/\/wa\.me\/2290197123456\?text=/);
  expect(decodeURIComponent(wa!)).toContain('reçu n° 1');

  await done.getByRole('button', { name: 'Imprimer le reçu' }).click();
  await expect(page.getByTestId('receipt-number')).toHaveText('N° 000001');
  await expect(page.getByText('Arrêté le présent reçu à la somme de vingt-mille francs CFA.')).toBeVisible();
  await expect(page.getByText(/80\s000\sF/)).toBeVisible();
});

test('elle ajoute un caissier, qui reçoit un mot de passe provisoire', async () => {
  await nav('Équipe').click();
  await page.getByRole('button', { name: 'Ajouter un caissier' }).click();
  cashierPhone = `01${String(Date.now() + 7).slice(-8)}`;
  const sheet = page.getByRole('dialog', { name: 'Ajouter un caissier' });
  await sheet.getByLabel('Nom').fill('Rachidi');
  await sheet.getByLabel('Téléphone (identifiant de connexion)').fill(cashierPhone);
  await sheet.getByRole('button', { name: 'Créer le compte' }).click();
  cashierPassword = (await page.getByTestId('temp-password').textContent())!.trim();
  expect(cashierPassword).toMatch(/^[a-z]{4}\d{4}$/);
  await page.getByRole('button', { name: 'C’est noté' }).click();
  await expect(page.getByRole('table', { name: 'Équipe' })).toContainText('Rachidi');

  // Lien du portail parent, pour plus tard.
  await nav('Élèves').click();
  await page.getByRole('link', { name: 'HOUNGBO Afi' }).click();
  await page.getByRole('button', { name: 'Portail parent' }).click();
  portalUrl = await page.getByLabel('Lien du portail').inputValue();
  await page.getByRole('button', { name: 'Fermer' }).click();

  await nav('Réglages').click();
  await page.getByRole('button', { name: /Se déconnecter/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('le caissier encaisse mais n’a pas accès aux réglages de la direction', async () => {
  await page.goto('/connexion');
  await page.getByLabel('Numéro de téléphone').fill(cashierPhone);
  await page.getByLabel('Mot de passe').fill(cashierPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(nav('Équipe')).toHaveCount(0);

  // Bouton « Encaisser » de la barre latérale : recherche par nom.
  await page.getByRole('complementary', { name: 'Navigation' }).getByRole('button', { name: 'Encaisser' }).click();
  const picker = page.getByRole('dialog', { name: 'Encaisser pour quel élève ?' });
  await picker.getByLabel('Rechercher un élève').fill('afi');
  await picker.getByRole('button', { name: /HOUNGBO Afi/ }).click();

  const collect = page.getByRole('dialog', { name: /Encaisser · Afi/ });
  await collect.getByLabel('Montant reçu en francs CFA').fill('200000');
  await collect.getByRole('button', { name: /Encaisser 200\s000\sF/ }).click();
  await expect(collect.getByText(/Il ne reste que 80\s000\sF à payer\./)).toBeVisible();
  await collect.getByLabel('Montant reçu en francs CFA').fill('15000');
  await collect.getByRole('button', { name: 'Mobile Money' }).click();
  await collect.getByLabel('Référence de la transaction').fill('MP261006.1042');
  await collect.getByRole('button', { name: /Encaisser 15\s000\sF/ }).click();
  await expect(page.getByRole('dialog', { name: 'Paiement enregistré' }).getByTestId('receipt-done')).toContainText(
    'Reçu n° 2',
  );
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Pas d'annulation pour un caissier.
  await page.getByTestId('payment').first().click();
  await expect(page.getByTestId('receipt-number')).toHaveText('N° 000002');
  await expect(page.getByRole('button', { name: 'Annuler ce reçu' })).toHaveCount(0);

  await page.goto('/app/equipe');
  await expect(page).toHaveURL(/\/app$/);
  await nav('Réglages').click();
  await page.getByRole('button', { name: /Se déconnecter/ }).click();
});

test('le parent consulte et paie depuis son téléphone', async ({ browser }) => {
  const phone = await browser.newPage({ ...devices['Pixel 7'] });
  await phone.goto(portalUrl);
  await expect(phone.getByText('Afi HOUNGBO · CM2')).toBeVisible();
  await expect(phone.getByTestId('portal-balance')).toHaveText(/65\s000\sF/);
  await expect(phone.getByRole('link', { name: /Reçu n° 1/ })).toBeVisible();

  await phone.getByRole('button', { name: 'Payer par Mobile Money' }).click();
  const sheet = phone.getByRole('dialog', { name: 'Payer par Mobile Money' });
  await sheet.getByLabel('Montant à payer').fill('25000');
  await sheet.getByRole('button', { name: /Payer 25\s000\sF/ }).click();
  await expect(phone).toHaveURL(/\/paiement\/simulation\//);
  await phone.getByLabel('Numéro Mobile Money').fill('97 12 34 56');
  await phone.getByRole('button', { name: /Valider le paiement de 25\s000\sF/ }).click();

  await expect(phone.getByTestId('payment-status')).toHaveText('Paiement reçu, merci !');
  await expect(phone.getByText(/Reste à payer : 40\s000\sF/)).toBeVisible();
  await phone.getByRole('link', { name: 'Voir le reçu' }).click();
  await expect(phone.getByTestId('receipt-number')).toHaveText('N° 000003');
  await expect(phone.getByText('Paiement Mobile Money en ligne')).toBeVisible();
  await phone.close();
});

test('la directrice annule un reçu et contrôle la caisse du jour', async () => {
  await page.goto('/connexion');
  await page.getByLabel('Numéro de téléphone').fill(DIRECTOR_PHONE);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('today')).toHaveText(/60\s000\sF/);

  await nav('Caisse du jour').click();
  await expect(page.getByTestId('cash-total')).toHaveText(/60\s000\sF/);
  const byCashier = page.getByRole('table').first();
  await expect(byCashier).toContainText('Rachidi');
  await expect(byCashier).toContainText('En ligne (Mobile Money)');

  // Le reçu n° 2 a été saisi en double : on l'annule.
  await page.getByRole('table', { name: 'Reçus de la journée' }).getByRole('row', { name: /^2 / }).click();
  await page.getByRole('button', { name: 'Annuler ce reçu' }).click();
  const sheet = page.getByRole('dialog', { name: /Annuler le reçu n° 2/ });
  await sheet.getByLabel('Motif').fill('Saisi en double');
  await sheet.getByRole('button', { name: 'Annuler le reçu' }).click();
  await expect(page.getByTestId('receipt-cancelled')).toContainText('Saisi en double');

  await nav('Caisse du jour').click();
  await expect(page.getByTestId('cash-total')).toHaveText(/45\s000\sF/);
  await expect(page.getByText('1 annulé')).toBeVisible();

  await nav('Élèves').click();
  await page.getByRole('link', { name: 'HOUNGBO Afi' }).click();
  await expect(page.getByTestId('paid')).toHaveText(/45\s000\sF/);
  await expect(page.getByTestId('balance')).toHaveText(/55\s000\sF/);
});

test('elle importe une liste d’élèves depuis Excel', async () => {
  await nav('Élèves').click();
  await page.getByRole('link', { name: 'Importer' }).click();
  await page
    .getByLabel('Liste')
    .fill('Nom;Prénom;Classe;Parent;Téléphone\nDOSSOU;Rodrigue;CM2;M. Dossou;97000001\nBIO;Mariam;CE1;Mme Bio;');
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('Ligne 3 : Classe inconnue : « CE1 ».')).toBeVisible();
  await page
    .getByLabel('Liste')
    .fill('Nom;Prénom;Classe;Parent;Téléphone\nDOSSOU;Rodrigue;CM2;M. Dossou;97000001\nBIO;Mariam;CM2;Mme Bio;');
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('2 élève(s) importé(s)')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Liste des élèves' }).getByRole('row')).toHaveCount(5);
});

test('démo : une école d’exemple complète', async ({ browser }) => {
  const visitor = await browser.newPage();
  await visitor.goto('/');
  await visitor.getByRole('button', { name: 'Essayer avec une école d’exemple' }).click();
  await expect(visitor).toHaveURL(/\/app$/);
  await expect(visitor.getByText('Démo', { exact: true })).toBeVisible();
  await expect(visitor.getByTestId('rate')).toHaveText(/\d+\s%/);
  await expect(visitor.getByRole('heading', { name: /Plus gros retards/ })).toBeVisible();
  await visitor.getByRole('row', { name: /^CM2/ }).click();
  await expect(visitor.getByRole('table', { name: 'Liste des élèves' }).getByRole('row')).toHaveCount(6);
  await visitor.close();
});
