/*
# Un rendez-vous confirme fait avancer le lead

Les rendez-vous Onify sont repris dans Google Agenda, importes dans le CRM,
puis rattaches au lead par `rattacher_rendez_vous_clients`. Jusqu'ici ce
rattachement alimentait correctement l'agenda, mais la fiche restait dans son
ancienne colonne du pipe.

La regle est placee sur `appointments`, et non dans une interface : elle
s'applique donc aux synchronisations Onify/Google comme aux rendez-vous crees
directement dans le CRM.

Garde-fous :
- le rendez-vous doit etre a venir et planifie ou confirme ;
- un rendez-vous annule, absent, termine ou passe ne change rien ;
- un dossier facture/converti et un lead archive ne sont jamais retrogrades ;
- le passage d'etape ajoute une note une seule fois, uniquement si le statut
  a reellement change.
*/

create or replace function public.avancer_lead_apres_rendez_vous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null
     or new.status not in ('scheduled', 'confirmed')
     or new.end_time <= now() then
    return new;
  end if;

  with avances as (
    update public.leads l
       set status = 'appointment_scheduled',
           next_action_at = null,
           updated_at = now()
     where l.id = new.lead_id
       and l.workspace_id = new.workspace_id
       and l.archived_at is null
       and l.status not in ('appointment_scheduled', 'converted')
    returning l.id, l.workspace_id, l.contact_id
  )
  insert into public.notes (workspace_id, lead_id, contact_id, content)
  select a.workspace_id,
         a.id,
         a.contact_id,
         'Passage automatique à RDV pris : rendez-vous du '
           || to_char(new.start_time at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
           || ' synchronisé avec l''agenda.'
    from avances a;

  return new;
end
$$;

revoke all on function public.avancer_lead_apres_rendez_vous()
  from public, anon, authenticated;

drop trigger if exists appointments_avance_lead on public.appointments;
create trigger appointments_avance_lead
after insert or update of lead_id, status, start_time, end_time
on public.appointments
for each row
execute function public.avancer_lead_apres_rendez_vous();

comment on function public.avancer_lead_apres_rendez_vous() is
  'Passe un lead non cloture a RDV pris lorsqu un rendez-vous futur lui est rattache.';

-- Rattrapage prudent des rendez-vous futurs deja rattaches avant cette
-- migration. La note n'est creee que pour les leads dont le statut change.
with rendez_vous_futurs as (
  select distinct on (a.lead_id)
         a.lead_id,
         a.workspace_id,
         a.contact_id,
         a.start_time
    from public.appointments a
    join public.leads l
      on l.id = a.lead_id
     and l.workspace_id = a.workspace_id
   where a.lead_id is not null
     and a.status in ('scheduled', 'confirmed')
     and a.end_time > now()
     and l.archived_at is null
     and l.status not in ('appointment_scheduled', 'converted')
   order by a.lead_id, a.start_time
),
avances as (
  update public.leads l
     set status = 'appointment_scheduled',
         next_action_at = null,
         updated_at = now()
    from rendez_vous_futurs r
   where l.id = r.lead_id
  returning l.id, l.workspace_id, l.contact_id
)
insert into public.notes (workspace_id, lead_id, contact_id, content)
select a.workspace_id,
       a.id,
       a.contact_id,
       'Passage automatique à RDV pris : rendez-vous à venir déjà présent dans l''agenda.'
  from avances a;

