/*
# Preuve d'envoi IONOS

Un email accepte par SMTP est bien transmis au serveur IONOS, mais SMTP ne
depose pas automatiquement une copie dans le dossier « Envoyes » du webmail.
Ces deux dates permettent de distinguer clairement les deux operations.
*/

alter table public.communications
  add column if not exists email_smtp_accepted_at timestamptz,
  add column if not exists email_sent_copy_saved_at timestamptz;

comment on column public.communications.email_smtp_accepted_at is
  'Date a laquelle le serveur SMTP IONOS a accepte le message sortant.';

comment on column public.communications.email_sent_copy_saved_at is
  'Date a laquelle une copie du message a ete ajoutee au dossier Envoyes IONOS par IMAP.';

-- Les anciens emails IONOS n'etaient journalises qu'apres acceptation SMTP :
-- leur date de creation constitue donc une preuve d'acceptation fiable. Leur
-- presence historique dans le dossier Envoyes reste inconnue et n'est pas
-- inventee.
update public.communications
   set email_smtp_accepted_at = created_at
 where provider = 'ionos-smtp'
   and direction = 'outbound'
   and status in ('sent', 'delivered')
   and email_smtp_accepted_at is null;

