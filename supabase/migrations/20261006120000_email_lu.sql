/*
# Savoir ce qu'on a déjà lu

La boîte mail affichait tous les messages du même poids. Rien ne distinguait
celui arrivé il y a dix minutes de celui traité la semaine dernière : pour
retrouver ce qui restait à voir, il fallait se souvenir.

C'est le repère le plus utile d'une messagerie, et il manquait faute d'un
endroit où le stocker. `read_at` le porte : nul tant que personne n'a ouvert
le message, horodaté à la première ouverture.

Seuls les messages reçus comptent. Un message qu'on a soi-même envoyé n'a
jamais été « non lu » ; l'index ne retient donc que l'entrant, ce qui le
garde petit quoi qu'il arrive au volume sortant.
*/

alter table public.communications
  add column if not exists read_at timestamptz;

comment on column public.communications.read_at is
  'Première ouverture du message dans le CRM. Nul = non lu.';

create index if not exists communications_emails_non_lus_idx
  on public.communications (workspace_id, created_at desc)
  where direction = 'inbound' and read_at is null and type = 'email_inbound';
