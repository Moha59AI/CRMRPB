import {
  PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb,
} from 'pdf-lib';

export interface BonRemiseCadeauData {
  cadeau: string;
  referenceDossier: string;
  dateSinistre: string;
  statut: string;
  beneficiaire: string;
  adresse: string;
  telephone: string;
  vehicule: string;
  immatriculation: string;
  assureur: string;
  numeroAssure: string;
  tvaRestante: string;
}

const INK = rgb(0.08, 0.12, 0.11);
const MUTED = rgb(0.39, 0.44, 0.42);
const GREEN = rgb(0.16, 0.56, 0.46);

function texteCompatible(font: PDFFont, value: string): string {
  const propre = value.trim() || 'À compléter';
  try {
    font.encodeText(propre);
    return propre;
  } catch {
    return propre
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E€]/g, '?');
  }
}

function dessinerAjuste(params: {
  page: PDFPage;
  font: PDFFont;
  texte: string;
  x: number;
  y: number;
  largeur: number;
  taille?: number;
  minimum?: number;
  couleur?: ReturnType<typeof rgb>;
}) {
  const {
    page, font, x, y, largeur,
    taille = 9, minimum = 6.2, couleur = INK,
  } = params;
  const texte = texteCompatible(font, params.texte);
  let tailleFinale = taille;
  while (tailleFinale > minimum && font.widthOfTextAtSize(texte, tailleFinale) > largeur) {
    tailleFinale -= 0.25;
  }
  page.drawText(texte, { x, y, size: tailleFinale, font, color: couleur });
}

function ligneInfo(params: {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  label: string;
  valeur: string;
  x: number;
  y: number;
  largeur: number;
}) {
  const { page, regular, bold, label, valeur, x, y, largeur } = params;
  const labelPdf = texteCompatible(bold, label);
  page.drawText(labelPdf, { x, y, size: 7.5, font: bold, color: MUTED });
  const decalage = bold.widthOfTextAtSize(labelPdf, 7.5) + 5;
  dessinerAjuste({
    page, font: regular, texte: valeur, x: x + decalage, y,
    largeur: Math.max(30, largeur - decalage), taille: 7.7, minimum: 5.8,
  });
}

function nomFichier(data: BonRemiseCadeauData): string {
  const personne = data.beneficiaire
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'client';
  return `bon-remise-cadeau-${personne}.pdf`;
}

function formaterDateFr(value: string): string {
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!correspondance) return value;
  return `${correspondance[3]}/${correspondance[2]}/${correspondance[1]}`;
}

function montantAvecEuro(value: string): string {
  const montant = value.trim();
  if (!montant) return 'À compléter';
  return /(?:€|euros?)$/i.test(montant) ? montant : `${montant} €`;
}

export async function genererBonRemiseCadeau(
  data: BonRemiseCadeauData,
): Promise<{ blob: Blob; filename: string }> {
  const base = `${import.meta.env.BASE_URL}templates/bon-remise-cadeau-modele.pdf`;
  const response = await fetch(base);
  if (!response.ok) throw new Error('Le modèle du bon de remise est introuvable.');

  const document = await PDFDocument.load(await response.arrayBuffer());
  const page = document.getPage(0);
  if (!page) throw new Error('Le modèle du bon de remise ne contient aucune page.');

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const annee = String(new Date().getFullYear());

  dessinerAjuste({ page, font: bold, texte: data.referenceDossier, x: 77, y: 759, largeur: 134, taille: 7.8 });
  dessinerAjuste({ page, font: bold, texte: formaterDateFr(data.dateSinistre) || '__ / __ / ____', x: 268, y: 759, largeur: 120, taille: 7.8 });
  dessinerAjuste({ page, font: bold, texte: data.statut, x: 417, y: 759, largeur: 145, taille: 7.8, couleur: GREEN });

  dessinerAjuste({
    page, font: bold, texte: data.cadeau, x: 36, y: 684,
    largeur: 340, taille: 25, minimum: 11, couleur: INK,
  });

  page.drawText('BÉNÉFICIAIRE', { x: 36, y: 635, size: 6.8, font: bold, color: GREEN });
  dessinerAjuste({ page, font: bold, texte: data.beneficiaire, x: 36, y: 620, largeur: 252, taille: 11, minimum: 7 });
  ligneInfo({ page, regular, bold, label: 'Adresse', valeur: data.adresse, x: 36, y: 605, largeur: 252 });
  ligneInfo({ page, regular, bold, label: 'Téléphone', valeur: data.telephone, x: 36, y: 590, largeur: 252 });

  page.drawText('VÉHICULE ET ASSURANCE', { x: 303, y: 635, size: 6.8, font: bold, color: GREEN });
  dessinerAjuste({ page, font: bold, texte: data.vehicule, x: 303, y: 620, largeur: 252, taille: 10.5, minimum: 7 });
  ligneInfo({ page, regular, bold, label: 'Immatriculation', valeur: data.immatriculation, x: 303, y: 605, largeur: 252 });
  ligneInfo({ page, regular, bold, label: 'Assureur', valeur: data.assureur, x: 303, y: 590, largeur: 252 });
  ligneInfo({ page, regular, bold, label: 'N° assuré', valeur: data.numeroAssure, x: 303, y: 575, largeur: 252 });

  dessinerAjuste({
    page, font: bold, texte: data.cadeau, x: 166, y: 531,
    largeur: 385, taille: 10.5, minimum: 7, couleur: INK,
  });

  dessinerAjuste({
    page, font: bold, texte: montantAvecEuro(data.tvaRestante),
    x: 36, y: 449, largeur: 108, taille: 15, minimum: 8,
  });
  page.drawText(`Réglé le : ____ / ____ / ${annee}`, {
    x: 150, y: 451, size: 7.2, font: regular, color: MUTED,
  });

  page.drawText('POUR RELAIS PARE-BRISE', { x: 36, y: 210, size: 6.8, font: bold, color: GREEN });
  page.drawText('Nom : ...........................................................', { x: 36, y: 194, size: 7.5, font: regular, color: INK });
  page.drawText(`Date et heure : ____ / ____ / ${annee} à ____ h ____`, { x: 36, y: 179, size: 7.5, font: regular, color: INK });
  page.drawText('Signature / cachet :', { x: 36, y: 163, size: 7.5, font: bold, color: MUTED });

  dessinerAjuste({
    page, font: bold, texte: `POUR ${data.beneficiaire.toUpperCase()}`,
    x: 303, y: 210, largeur: 252, taille: 6.8, minimum: 5.5, couleur: GREEN,
  });
  page.drawText('Nom et qualité : ...............................................', { x: 303, y: 194, size: 7.5, font: regular, color: INK });
  page.drawText('Lieu de remise : .................................................', { x: 303, y: 179, size: 7.5, font: regular, color: INK });
  page.drawText('Signature précédée de « Lu et approuvé » :', { x: 303, y: 163, size: 7.2, font: bold, color: MUTED });

  document.setTitle(`Bon de remise de cadeau - ${data.beneficiaire}`);
  document.setAuthor('Relais Pare-Brise');
  document.setSubject(`Attestation personnalisée de remise du cadeau : ${data.cadeau}`);
  const bytes = await document.save();
  const copie = new Uint8Array(bytes.length);
  copie.set(bytes);

  return {
    blob: new Blob([copie.buffer], { type: 'application/pdf' }),
    filename: nomFichier(data),
  };
}
