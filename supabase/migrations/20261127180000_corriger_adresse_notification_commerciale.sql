/*
  Le compte CRM confirmé de Latefa Benamar utilise b.latefa@relaisparebrise.fr.
  L'adresse l.benamar@relaisparebrise.fr n'est pas celle de son compte : on la
  retire des alertes documentaires et on conserve les autres destinataires.
*/

update public.workspaces
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{document_notification_emails}',
  case
    when jsonb_typeof(coalesce(settings, '{}'::jsonb)->'document_notification_emails') = 'array'
      then (
        (coalesce(settings, '{}'::jsonb)->'document_notification_emails')
          - 'l.benamar@relaisparebrise.fr'
      ) || case
        when (
          (coalesce(settings, '{}'::jsonb)->'document_notification_emails')
            - 'l.benamar@relaisparebrise.fr'
        ) ? 'b.latefa@relaisparebrise.fr'
          then '[]'::jsonb
        else jsonb_build_array('b.latefa@relaisparebrise.fr')
      end
    else jsonb_build_array('b.latefa@relaisparebrise.fr')
  end,
  true
)
where slug = 'relais-pare-brise';
