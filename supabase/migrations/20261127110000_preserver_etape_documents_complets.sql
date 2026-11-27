/*
  Une relance documentaire pouvait creer une nouvelle demande vide puis faire
  repasser un lead deja complet de « A planifier » a « Documents ».

  Le code applicatif empeche desormais cette regression. Cette consolidation
  remet aussi les dossiers deja touches dans l'etape correspondant aux pieces
  obligatoires effectivement recues.
*/

begin;

update public.leads lead
set
  status = 'documents_received',
  updated_at = now()
where lead.status = 'documents_requested'
  and lead.archived_at is null
  and exists (
    select 1
    from public.client_document_requests request
    where request.lead_id = lead.id
      and request.workspace_id = lead.workspace_id
      and request.status = 'complete'
  );

commit;
