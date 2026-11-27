/*
  La commerciale reçoit elle aussi l'alerte interne lorsqu'un client dépose
  une pièce. L'adresse principale configurée par secret reste destinataire ;
  cette liste ne fait qu'ajouter des destinataires propres à ce workspace.
*/

update public.workspaces
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{document_notification_emails}',
  case
    when jsonb_typeof(coalesce(settings, '{}'::jsonb)->'document_notification_emails') = 'array'
      then (coalesce(settings, '{}'::jsonb)->'document_notification_emails')
        || jsonb_build_array('l.benamar@relaisparebrise.fr')
    else jsonb_build_array('l.benamar@relaisparebrise.fr')
  end,
  true
)
where slug = 'relais-pare-brise'
  and not (
    case
      when jsonb_typeof(coalesce(settings, '{}'::jsonb)->'document_notification_emails') = 'array'
        then coalesce(settings, '{}'::jsonb)->'document_notification_emails'
      else '[]'::jsonb
    end
    ? 'l.benamar@relaisparebrise.fr'
  );
