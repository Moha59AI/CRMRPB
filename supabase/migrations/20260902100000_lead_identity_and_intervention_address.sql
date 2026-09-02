/*
# Fiche lead : adresse principale et adresse d'intervention

`address`, `postal_code` et `city` représentent l'adresse principale du lead.
Elle est aussi utilisée pour l'intervention par défaut.

Les colonnes `intervention_*` ne sont remplies que si le véhicule se trouve à
une autre adresse. L'absence de valeur signifie donc explicitement « même
adresse », sans recopier des données qui finiraient par diverger.
*/

alter table public.leads
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists citycode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geo_precision text
    check (geo_precision in ('exact', 'approximatif')),
  add column if not exists intervention_address text,
  add column if not exists intervention_postal_code text,
  add column if not exists intervention_city text,
  add column if not exists intervention_citycode text,
  add column if not exists intervention_latitude double precision,
  add column if not exists intervention_longitude double precision,
  add column if not exists intervention_geo_precision text
    check (intervention_geo_precision in ('exact', 'approximatif'));

comment on column public.leads.address is
  'Adresse principale, utilisée pour l intervention en l absence d une adresse différente.';
comment on column public.leads.intervention_address is
  'Adresse d intervention différente. NULL signifie que l adresse principale est utilisée.';

create index if not exists leads_intervention_citycode_idx
  on public.leads (intervention_citycode)
  where intervention_citycode is not null;

/*
 * Les formulaires transmettent déjà le code postal dans le payload brut.
 * On le remonte dans sa vraie colonne dès la création du lead. La ville est
 * prise si le formulaire l'a fournie ; sinon la table postale locale permet
 * de la résoudre sans transmettre le code postal du client à un tiers.
 */
create or replace function public.capture_lead_location_from_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payload_postal_code text;
  payload_city text;
  payload_citycode text;
begin
  if new.raw_payload is null then return new; end if;

  payload_postal_code := coalesce(
    nullif(regexp_replace(new.raw_payload ->> 'code_postal', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(new.raw_payload ->> 'postal_code', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(new.raw_payload ->> 'postcode', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(new.raw_payload ->> 'zip_code', '[^0-9]', '', 'g'), '')
  );

  payload_city := coalesce(
    nullif(btrim(new.raw_payload ->> 'ville'), ''),
    nullif(btrim(new.raw_payload ->> 'city'), '')
  );

  -- Meta range les réponses dans field_data. Cette lecture en base garde la
  -- migration compatible même si l'ancienne version du processeur est encore
  -- déployée quelques minutes.
  payload_postal_code := coalesce(payload_postal_code, (
    select nullif(regexp_replace(fd -> 'values' ->> 0, '[^0-9]', '', 'g'), '')
    from jsonb_array_elements(
      case when jsonb_typeof(new.raw_payload -> 'field_data') = 'array'
        then new.raw_payload -> 'field_data' else '[]'::jsonb end
    ) fd
    where lower(fd ->> 'name') in (
      'postal_code', 'postcode', 'zip_code', 'code_postal', 'code_postale'
    )
    limit 1
  ));

  payload_city := coalesce(payload_city, (
    select nullif(btrim(fd -> 'values' ->> 0), '')
    from jsonb_array_elements(
      case when jsonb_typeof(new.raw_payload -> 'field_data') = 'array'
        then new.raw_payload -> 'field_data' else '[]'::jsonb end
    ) fd
    where lower(fd ->> 'name') in ('city', 'ville')
    limit 1
  ));

  -- Compatibilité avec l'ancien processeur Meta : il écrivait directement
  -- le code postal dans city lorsque le formulaire ne donnait pas de ville.
  if payload_postal_code is null and new.city ~ '^[0-9]{5}$' then
    payload_postal_code := new.city;
  end if;

  -- Si le formulaire n'envoie que le code postal, la table locale choisit la
  -- commune principale. Aucun code postal client ne quitte la base.
  if payload_city is null and payload_postal_code ~ '^[0-9]{5}$' then
    select p.city, p.citycode
    into payload_city, payload_citycode
    from public.postal_code_cities p
    where p.postal_code = payload_postal_code
    order by p.population desc, p.city
    limit 1;
  elsif payload_postal_code ~ '^[0-9]{5}$' then
    select p.citycode
    into payload_citycode
    from public.postal_code_cities p
    where p.postal_code = payload_postal_code
      and lower(p.city) = lower(payload_city)
    limit 1;
  end if;

  if (new.postal_code is null or btrim(new.postal_code) = '')
     and payload_postal_code ~ '^[0-9]{5}$' then
    new.postal_code := payload_postal_code;
  end if;

  -- L'ancien processeur Meta plaçait parfois le code postal dans city.
  if new.city ~ '^[0-9]{5}$' then
    new.city := null;
  end if;

  if (new.city is null or btrim(new.city) = '')
     and payload_city is not null
     and payload_city !~ '^[0-9]{5}$' then
    new.city := payload_city;
  end if;

  if (new.citycode is null or btrim(new.citycode) = '')
     and payload_citycode is not null then
    new.citycode := payload_citycode;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_capture_location_from_payload on public.leads;
create trigger leads_capture_location_from_payload
before insert or update of raw_payload, postal_code, city on public.leads
for each row execute function public.capture_lead_location_from_payload();

-- Reprise des codes postaux déjà reçus, sans modifier les villes existantes.
update public.leads
set postal_code = coalesce(
  nullif(regexp_replace(raw_payload ->> 'code_postal', '[^0-9]', '', 'g'), ''),
  nullif(regexp_replace(raw_payload ->> 'postal_code', '[^0-9]', '', 'g'), ''),
  nullif(regexp_replace(raw_payload ->> 'postcode', '[^0-9]', '', 'g'), ''),
  nullif(regexp_replace(raw_payload ->> 'zip_code', '[^0-9]', '', 'g'), '')
)
where (postal_code is null or btrim(postal_code) = '')
  and raw_payload is not null
  and coalesce(
    nullif(regexp_replace(raw_payload ->> 'code_postal', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(raw_payload ->> 'postal_code', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(raw_payload ->> 'postcode', '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(raw_payload ->> 'zip_code', '[^0-9]', '', 'g'), '')
  ) ~ '^[0-9]{5}$';

-- Les leads historiques qui avaient le code postal mais pas la ville sont
-- complétés immédiatement avec la commune principale de ce code postal.
update public.leads l
set city = p.city,
    citycode = coalesce(l.citycode, p.citycode)
from (
  select distinct on (postal_code) postal_code, city, citycode
  from public.postal_code_cities
  order by postal_code, population desc, city
) p
where l.postal_code = p.postal_code
  and (l.city is null or btrim(l.city) = '');

-- Reprise des réponses Meta historiques imbriquées dans field_data. Le
-- trigger ci-dessus complète immédiatement la ville et son code INSEE.
with meta_postal_codes as (
  select distinct on (l.id)
    l.id,
    nullif(regexp_replace(fd -> 'values' ->> 0, '[^0-9]', '', 'g'), '') as postal_code
  from public.leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.raw_payload -> 'field_data') = 'array'
      then l.raw_payload -> 'field_data' else '[]'::jsonb end
  ) fd
  where lower(fd ->> 'name') in (
    'postal_code', 'postcode', 'zip_code', 'code_postal', 'code_postale'
  )
)
update public.leads l
set postal_code = m.postal_code,
    city = case when l.city ~ '^[0-9]{5}$' then null else l.city end
from meta_postal_codes m
where l.id = m.id
  and m.postal_code ~ '^[0-9]{5}$'
  and (
    l.postal_code is null
    or btrim(l.postal_code) = ''
    or l.city ~ '^[0-9]{5}$'
  );

-- Dernier cas historique : le code postal avait été écrit dans city mais le
-- payload brut ne permet plus de retrouver le nom original du champ Meta.
-- Le trigger transforme cette valeur avant l'écriture et résout la commune.
update public.leads
set postal_code = city,
    city = null
where city ~ '^[0-9]{5}$'
  and (postal_code is null or btrim(postal_code) = '');
