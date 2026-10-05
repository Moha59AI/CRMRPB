/*
# Un lead sans réponse ne doit jamais sortir de la file

La cadence NRP commençait à la tentative 1. Un lead marqué « sans réponse »
dont le compteur était resté à zéro ne correspondait donc à aucune marche :
aucun délai, aucune date d'échéance, et il disparaissait de la file de
relances. Onze leads sont dans ce cas aujourd'hui -- ceux marqués depuis la
fiche, avant que le compteur ne suive le résultat d'appel.

Le compteur avance correctement désormais, donc le cas ne se reproduira
pas. Mais une cadence qui laisse un état sans règle est un piège : elle fait
disparaître des leads sans rien dire. On ferme le trou plutôt que de
réparer les onze lignes, pour que le prochain oubli de comptage n'ait plus
de conséquence.

Zéro tentative enregistrée se traite comme la première : rappel deux heures
après le dernier contact. Ces onze leads n'ayant pas été contactés depuis
longtemps, ils reviennent en tête de file -- ce qui est exactement ce qu'on
veut d'un lead qu'on a cessé d'appeler sans décider de l'abandonner.
*/

create or replace function public.semer_cadences_defaut(p_workspace uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into relance_cadences (workspace_id, statut, tentative_min, delai)
  values
    (p_workspace, 'new',                 0, interval '0 minutes'),
    (p_workspace, 'to_call',             0, interval '0 minutes'),
    (p_workspace, 'calling',             0, interval '0 minutes'),
    (p_workspace, 'documents_received',  0, interval '0 minutes'),
    (p_workspace, 'interested',          0, interval '1 day'),
    (p_workspace, 'documents_requested', 0, interval '2 days'),
    -- Aucune tentative enregistrée : on traite comme la première plutôt que
    -- de laisser le lead sans règle, donc sans échéance, donc invisible.
    (p_workspace, 'nrp',                 0, interval '2 hours'),
    (p_workspace, 'nrp',                 1, interval '2 hours'),
    (p_workspace, 'nrp',                 2, interval '1 day'),
    (p_workspace, 'nrp',                 3, interval '4 hours'),
    (p_workspace, 'nrp',                 4, interval '2 days'),
    (p_workspace, 'nrp',                 5, null)
  on conflict (workspace_id, statut, tentative_min) do nothing;
$$;

insert into public.relance_cadences (workspace_id, statut, tentative_min, delai)
select w.id, 'nrp', 0, interval '2 hours' from public.workspaces w
on conflict (workspace_id, statut, tentative_min) do nothing;
