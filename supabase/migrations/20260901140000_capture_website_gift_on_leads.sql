/*
  Enregistre automatiquement le cadeau choisi sur le site dans leads.offer.
  Le payload brut reste conserve pour l'audit et la reprise eventuelle.
*/

CREATE OR REPLACE FUNCTION public.capture_lead_offer_from_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  payload_offer text;
BEGIN
  IF NEW.offer IS NULL OR btrim(NEW.offer) = '' THEN
    payload_offer := coalesce(
      nullif(btrim(NEW.raw_payload ->> 'cadeau'), ''),
      nullif(btrim(NEW.raw_payload ->> 'choix_cadeau'), ''),
      nullif(btrim(NEW.raw_payload ->> 'gift'), ''),
      nullif(btrim(NEW.raw_payload ->> 'offer'), '')
    );

    IF payload_offer IS NOT NULL THEN
      NEW.offer := payload_offer;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_capture_offer_from_payload ON public.leads;
CREATE TRIGGER leads_capture_offer_from_payload
BEFORE INSERT OR UPDATE OF raw_payload, offer ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.capture_lead_offer_from_payload();

UPDATE public.leads
SET offer = coalesce(
  nullif(btrim(raw_payload ->> 'cadeau'), ''),
  nullif(btrim(raw_payload ->> 'choix_cadeau'), ''),
  nullif(btrim(raw_payload ->> 'gift'), ''),
  nullif(btrim(raw_payload ->> 'offer'), '')
)
WHERE (offer IS NULL OR btrim(offer) = '')
  AND raw_payload IS NOT NULL
  AND coalesce(
    nullif(btrim(raw_payload ->> 'cadeau'), ''),
    nullif(btrim(raw_payload ->> 'choix_cadeau'), ''),
    nullif(btrim(raw_payload ->> 'gift'), ''),
    nullif(btrim(raw_payload ->> 'offer'), '')
  ) IS NOT NULL;
