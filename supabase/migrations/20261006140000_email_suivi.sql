/*
# Suivre un message

L'étoile de la boîte mail tenait sa colonne sans rien faire : il n'existait
nulle part où ranger « celui-là, j'y reviens ». `starred_at` le porte — la
date plutôt qu'un booléen, parce qu'elle permet de trier les suivis par
ordre de marquage sans table supplémentaire.

Le marquage est personnel dans Gmail. Il ne l'est pas ici : l'équipe partage
une seule boîte, et un message suivi l'est pour tout le monde. C'est le
comportement attendu d'une boîte commune — ce que l'un signale, l'autre doit
le voir.
*/

alter table public.communications
  add column if not exists starred_at timestamptz;

comment on column public.communications.starred_at is
  'Message suivi, pour toute l''équipe. Nul = non suivi.';

create index if not exists communications_emails_suivis_idx
  on public.communications (workspace_id, starred_at desc)
  where starred_at is not null;
