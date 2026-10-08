from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd


SOURCE_IMPORT = "vsf-panther-2026-10-08"
EXPECTED_DOCUMENTS = 177
EXPECTED_ITEMS = 1_346
EXPECTED_NET_HT = 68_737.22
EXPECTED_NET_TTC = 82_484.70


def value(raw):
    if raw is None or bool(pd.isna(raw)):
        return None
    if isinstance(raw, pd.Timestamp):
        return raw.date().isoformat()
    if isinstance(raw, (datetime, date)):
        return raw.isoformat()
    if hasattr(raw, "item"):
        raw = raw.item()
    return raw


def number(raw):
    clean = value(raw)
    return None if clean is None else round(float(clean), 4)


def identifier(raw) -> str:
    clean = value(raw)
    if isinstance(clean, float) and clean.is_integer():
        return str(int(clean))
    return str(clean).strip()


def read_source(path: Path) -> list[dict]:
    documents = pd.read_excel(path, sheet_name=1, header=7)
    items = pd.read_excel(path, sheet_name=2, header=7)
    documents = documents[documents["N° document"].notna()].copy()
    items = items[items["N° document"].notna()].copy()

    detail_by_document: dict[tuple[str, str], list[dict]] = {}
    for _, row in items.iterrows():
        key = (str(row["Fournisseur"]).strip(), identifier(row["N° document"]))
        detail_by_document.setdefault(key, []).append(
            {
                "delivery_date": value(row["Date BL"]),
                "delivery_note": value(row["Bon livraison"]),
                "site": value(row["Site"]),
                "category": value(row["Famille"]),
                "sku": value(row["Référence article"]),
                "description": value(row["Désignation"]),
                "quantity": number(row["Quantité"]),
                "gross_unit_price_ht": number(row["PU brut HT"]),
                "discount_rate": number(row["Remise"]),
                "net_unit_price_ht": number(row["PU net HT"]),
                "amount_ht": number(row["Montant HT"]),
                "page": int(row["Page"]) if value(row["Page"]) is not None else None,
            }
        )

    result: list[dict] = []
    for _, row in documents.iterrows():
        supplier = str(row["Fournisseur"]).strip()
        document_number = identifier(row["N° document"])
        result.append(
            {
                "supplier": supplier,
                "document_type": "credit_note" if row["Type"] == "Avoir" else "invoice",
                "document_number": document_number,
                "invoice_date": value(row["Date facture"]),
                "amount_ht": number(row["Total HT"]),
                "vat_amount": number(row["TVA"]),
                "amount_ttc": number(row["Total TTC"]),
                "expected_payment_method": value(row["Mode prévu sur pièce"]),
                "due_date": value(row["Échéance prévue"]),
                "sites": value(row["Sites du détail"]),
                "item_count": int(row["Lignes détaillées"])
                if value(row["Lignes détaillées"]) is not None
                else 0,
                "items": detail_by_document.get((supplier, document_number), []),
                "pdf_available_in_source": row["PDF disponible"] == "Oui",
                "pdf_filename": value(row["Référence justificatif"]),
                "portal_date": value(row["Date portail"]),
                "observation": value(row["Observation"]),
            }
        )

    if len(result) != EXPECTED_DOCUMENTS:
        raise ValueError(f"Nombre de documents inattendu : {len(result)}")
    if sum(len(document["items"]) for document in result) != EXPECTED_ITEMS:
        raise ValueError("Le nombre de lignes détaillées ne correspond pas au contrôle source")
    if round(sum(document["amount_ht"] for document in result), 2) != EXPECTED_NET_HT:
        raise ValueError("Le total HT ne correspond pas au contrôle source")
    if round(sum(document["amount_ttc"] for document in result), 2) != EXPECTED_NET_TTC:
        raise ValueError("Le total TTC ne correspond pas au contrôle source")
    keys = {(document["supplier"], document["document_number"]) for document in result}
    if len(keys) != len(result):
        raise ValueError("Des doublons fournisseur/document ont été détectés")
    return result


def sql_for(documents: list[dict]) -> str:
    payload = json.dumps(documents, ensure_ascii=False, separators=(",", ":"))
    return f"""/*
# Dépenses fournisseurs VSF et Panther Pro

Import contrôlé du fichier Dépenses_detaillees_VSF_Panther_Pro_2026-10-08.xlsx.
Les avoirs conservent leurs montants négatifs. Les PDF sont seulement référencés :
leurs fichiers ne font pas partie du classeur fourni.
*/

create table if not exists public.supplier_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier text not null,
  document_type text not null check (document_type in ('invoice', 'credit_note')),
  document_number text not null,
  invoice_date date not null,
  amount_ht numeric(12,2) not null,
  vat_amount numeric(12,2) not null,
  amount_ttc numeric(12,2) not null,
  expected_payment_method text,
  due_date date,
  sites text,
  item_count integer not null default 0 check (item_count >= 0),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  pdf_available_in_source boolean not null default false,
  pdf_filename text,
  pdf_storage_path text,
  portal_date date,
  observation text,
  source_import text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, supplier, document_number)
);

create index if not exists supplier_expenses_workspace_date_idx
on public.supplier_expenses (workspace_id, invoice_date desc);

create index if not exists supplier_expenses_workspace_supplier_idx
on public.supplier_expenses (workspace_id, supplier);

alter table public.supplier_expenses enable row level security;

drop policy if exists "select_supplier_expenses" on public.supplier_expenses;
create policy "select_supplier_expenses"
on public.supplier_expenses for select to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'manager', 'accountant')
  )
);

drop policy if exists "write_supplier_expenses" on public.supplier_expenses;
create policy "write_supplier_expenses"
on public.supplier_expenses for all to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'accountant')
  )
)
with check (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'accountant')
  )
);

drop trigger if exists supplier_expenses_updated_at on public.supplier_expenses;
create trigger supplier_expenses_updated_at
before update on public.supplier_expenses
for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.supplier_expenses to authenticated;

do $$
declare
  v_workspace uuid;
  v_workspace_count integer;
  v_document_count integer;
  v_item_count integer;
  v_net_ht numeric(12,2);
  v_net_ttc numeric(12,2);
begin
  select count(*) into v_workspace_count from public.workspaces;

  if v_workspace_count <> 1 then
    raise exception 'Import fournisseurs interrompu : % espaces de travail trouvés', v_workspace_count;
  end if;

  select id into v_workspace from public.workspaces limit 1;

  insert into public.supplier_expenses (
    workspace_id, supplier, document_type, document_number, invoice_date,
    amount_ht, vat_amount, amount_ttc, expected_payment_method, due_date,
    sites, item_count, items, pdf_available_in_source, pdf_filename,
    portal_date, observation, source_import
  )
  select
    v_workspace, row.supplier, row.document_type, row.document_number,
    row.invoice_date, row.amount_ht, row.vat_amount, row.amount_ttc,
    row.expected_payment_method, row.due_date, row.sites, row.item_count,
    row.items, row.pdf_available_in_source, row.pdf_filename,
    row.portal_date, row.observation, '{SOURCE_IMPORT}'
  from jsonb_to_recordset($supplier_data${payload}$supplier_data$::jsonb) as row(
    supplier text,
    document_type text,
    document_number text,
    invoice_date date,
    amount_ht numeric,
    vat_amount numeric,
    amount_ttc numeric,
    expected_payment_method text,
    due_date date,
    sites text,
    item_count integer,
    items jsonb,
    pdf_available_in_source boolean,
    pdf_filename text,
    portal_date date,
    observation text
  )
  on conflict (workspace_id, supplier, document_number) do update set
    document_type = excluded.document_type,
    invoice_date = excluded.invoice_date,
    amount_ht = excluded.amount_ht,
    vat_amount = excluded.vat_amount,
    amount_ttc = excluded.amount_ttc,
    expected_payment_method = excluded.expected_payment_method,
    due_date = excluded.due_date,
    sites = excluded.sites,
    item_count = excluded.item_count,
    items = excluded.items,
    pdf_available_in_source = excluded.pdf_available_in_source,
    pdf_filename = excluded.pdf_filename,
    portal_date = excluded.portal_date,
    observation = excluded.observation,
    source_import = excluded.source_import,
    updated_at = now();

  select count(*), coalesce(sum(jsonb_array_length(items)), 0),
         round(sum(amount_ht), 2), round(sum(amount_ttc), 2)
  into v_document_count, v_item_count, v_net_ht, v_net_ttc
  from public.supplier_expenses
  where workspace_id = v_workspace and source_import = '{SOURCE_IMPORT}';

  if v_document_count <> {EXPECTED_DOCUMENTS}
     or v_item_count <> {EXPECTED_ITEMS}
     or v_net_ht <> {EXPECTED_NET_HT}
     or v_net_ttc <> {EXPECTED_NET_TTC} then
    raise exception 'Contrôle import fournisseurs invalide : documents=% lignes=% HT=% TTC=%',
      v_document_count, v_item_count, v_net_ht, v_net_ttc;
  end if;
end;
$$;
"""


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate-supplier-expenses-migration.py SOURCE.xlsx OUTPUT.sql")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.write_text(sql_for(read_source(source)), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
