/*
# Cohérence des dépenses fournisseurs

Les documents dont la date imprimée est illisible restent intégrés à la marge
avec la date de réception de l'e-mail, mais sont explicitement signalés comme
à contrôler. Aucun montant n'est recalculé ou inventé.
*/

begin;

update public.supplier_expenses
set
  accounting_status = 'review_required',
  needs_review = true,
  document_review_required = true,
  observation = concat_ws(
    ' · ',
    nullif(observation, ''),
    'Détail des lignes indisponible : montant à contrôler sur le document fournisseur.'
  ),
  updated_at = now()
where document_type = 'invoice'
  and item_count = 0
  and not document_review_required;

update public.supplier_document_jobs job
set
  status = 'pending',
  available_at = now(),
  completed_at = null,
  last_error = null,
  updated_at = now()
from public.supplier_document_analyses analysis
where analysis.id = job.analysis_id
  and job.status = 'review_required'
  and analysis.supplier_expense_id is null
  and analysis.document_type in ('invoice', 'delivery_note')
  and analysis.document_date is null
  and analysis.supplier is not null
  and analysis.document_number is not null
  and analysis.amount_ht is not null
  and analysis.vat_amount is not null
  and analysis.amount_ttc is not null
  and coalesce(analysis.confidence, 0) >= 80;

commit;
