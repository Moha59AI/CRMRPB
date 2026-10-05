// Un PDF minimal valide, pour l'aperçu de développement.
//
// Assez pour que le lecteur du navigateur l'affiche : en-tête, une page, deux
// lignes de texte. Il n'a rien à voir avec une facture réelle.

const LIGNES = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]'
    + '/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj',
  '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  '5 0 obj<</Length 120>>stream',
  'BT /F1 22 Tf 60 760 Td (Apercu de developpement) Tj ET',
  'BT /F1 12 Tf 60 730 Td (Ceci n est pas une facture.) Tj ET',
  'endstream endobj',
  'trailer<</Root 1 0 R/Size 6>>',
  '%%EOF',
];

export function pdfExemple(): Blob {
  return new Blob([LIGNES.join('\n')], { type: 'application/pdf' });
}
