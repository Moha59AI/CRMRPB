const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

/**
 * Point de terminaison conservé uniquement pour acquitter les éventuelles
 * tentatives de l'ancien webhook. La boîte CRM utilise exclusivement IONOS :
 * IMAP pour la réception et SMTP pour l'envoi.
 *
 * Répondre 200 empêche le prestataire historique de relancer indéfiniment,
 * sans lire son payload ni appeler son API.
 */
Deno.serve(() => {
  console.info('Webhook historique ignoré : réception IONOS IMAP active');
  return new Response(JSON.stringify({
    success: true,
    ignored: true,
    reason: 'RESEND_RETIRED_IONOS_IMAP_ACTIVE',
  }), { status: 200, headers });
});
