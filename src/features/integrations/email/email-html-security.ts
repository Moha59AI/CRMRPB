const EMAIL_FRAME_STYLE = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #fff; color: #101318; }
  body { padding: 20px; overflow-wrap: anywhere; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
`;

/**
 * Construit un document autonome pour l'iframe de lecture.
 * Le HTML vient d'un expediteur externe : scripts, formulaires, objets et
 * appels reseau sont donc bloques. Les images distantes restent optionnelles
 * car leur chargement peut confirmer l'ouverture du message a l'expediteur.
 */
export function buildEmailHtmlDocument(html: string, allowRemoteImages: boolean): string {
  const imageSources = allowRemoteImages ? 'data: blob: cid: https: http:' : 'data: blob: cid:';
  const securityHead = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'; img-src ${imageSources}; style-src 'unsafe-inline'; font-src data:;">`,
    '<base target="_blank">',
    `<style>${EMAIL_FRAME_STYLE}</style>`,
  ].join('');

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>${securityHead}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b([^>]*)>/i, `<html$1><head>${securityHead}</head>`);
  }
  return `<!doctype html><html><head>${securityHead}</head><body>${html}</body></html>`;
}
