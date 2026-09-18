export type UserRole = 'admin' | 'manager' | 'advisor' | 'technician' | 'accountant';

export type IntegrationProvider = 'meta' | 'google' | 'onify' | 'ionos' | 'custom';
export type IntegrationStatus = 'connected' | 'error' | 'not_configured';

export type WebhookDirection = 'inbound' | 'outbound';
export type WebhookProcessingStatus = 'pending' | 'processing' | 'processed' | 'error' | 'skipped';

export type GlassType =
  | 'pare_brise' | 'lunette_arriere' | 'glace_laterale' | 'impact' | 'autre';

export type LeadSource = 'meta' | 'google_ads' | 'webhook' | 'manual' | 'import';
export type LeadStatus =
  | 'new' | 'to_call' | 'calling' | 'nrp' | 'interested'
  | 'documents_requested' | 'documents_received' | 'appointment_scheduled'
  | 'lost' | 'converted';

export type CaseStatus =
  | 'new' | 'qualification' | 'documents_pending' | 'insurance_declaration'
  | 'glass_ordered' | 'appointment_scheduled' | 'intervention_done'
  | 'invoice_sent' | 'payment_pending' | 'payment_received' | 'gift_given'
  | 'sav' | 'completed';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType = 'intervention' | 'call' | 'meeting' | 'other';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskType = 'call' | 'sms' | 'email' | 'follow_up' | 'document' | 'other';

export type CommunicationType =
  | 'sms_outbound' | 'sms_inbound' | 'call_outbound' | 'call_inbound'
  | 'call_missed' | 'voicemail' | 'email_outbound' | 'email_inbound' | 'note';

export type CommunicationStatus =
  | 'pending' | 'sent' | 'delivered' | 'failed' | 'received'
  | 'answered' | 'missed' | 'cancelled';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type GiftStatus = 'pending' | 'ordered' | 'given' | 'cancelled';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
export type AfterSalesStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type DocumentType =
  | 'registration' | 'insurance_cert' | 'photo_before' | 'photo_windscreen'
  | 'claim_declaration' | 'assignment_signed' | 'quote' | 'invoice'
  | 'payment_proof' | 'gift_proof';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  /** Adresse principale, utilisée aussi pour l'intervention par défaut. */
  address: string | null;
  city: string | null;
  postal_code: string | null;
  /** Code INSEE de la commune : identifie la commune sans ambiguite d'orthographe. */
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** exact = adresse au numero. approximatif = centre de commune. null = non localise. */
  geo_precision: 'exact' | 'approximatif' | null;
  /** Adresse différente utilisée uniquement pour cette intervention. */
  intervention_address: string | null;
  intervention_postal_code: string | null;
  intervention_city: string | null;
  intervention_citycode: string | null;
  intervention_latitude: number | null;
  intervention_longitude: number | null;
  intervention_geo_precision: 'exact' | 'approximatif' | null;
  vehicle_registration: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  /** Le client. Un client peut avoir plusieurs leads : un par intervention. */
  contact_id: string | null;
  insurance: string | null;
  offer: string | null;
  /** Vitrage concerne, renseigne a la qualification. */
  glass_type: GlassType | null;
  /** Camera ADAS : impose un calibrage apres pose. */
  has_adas_camera: boolean | null;
  /** Reste a charge annonce au client. null = pas encore su, 0 = pris en charge. */
  franchise_amount: number | null;
  score: number;
  source: LeadSource;
  status: LeadStatus;
  assigned_user_id: string | null;
  campaign_name: string | null;
  advisor_notes: string | null;
  next_action_at: string | null;
  duplicate_flagged: boolean;
  meta_lead_id: string | null;
  meta_page_id: string | null;
  meta_form_id: string | null;
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  google_campaign_id: string | null;
  google_ad_group_id: string | null;
  google_ad_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  raw_payload: Record<string, unknown> | null;
  received_at: string | null;
  /**
   * Date d'arrivee du prospect : `received_at` quand elle existe, `created_at`
   * sinon. Calculee en base, sert au tri du plus recent au plus ancien.
   */
  arrive_le: string;
  /**
   * Sortie du champ de travail. null = actif. Ce n'est pas une suppression :
   * le lead reste rattache a son client et se retrouve.
   */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationConnection {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  name: string;
  status: IntegrationStatus;
  settings: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaForm {
  id: string;
  workspace_id: string;
  connection_id: string;
  meta_page_id: string | null;
  meta_form_id: string | null;
  form_name: string | null;
  enabled: boolean;
  field_mapping: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpoint {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  endpoint_key: string;
  direction: WebhookDirection;
  enabled: boolean;
  signing_secret_reference: string | null;
  configuration: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  workspace_id: string;
  endpoint_id: string | null;
  provider: string;
  external_event_id: string | null;
  event_type: string | null;
  headers: Record<string, string> | null;
  payload: Record<string, unknown> | null;
  processing_status: WebhookProcessingStatus;
  processing_attempts: number;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  /** Code INSEE de la commune : identifie la commune sans ambiguite d'orthographe. */
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** exact = adresse au numero. approximatif = centre de commune. null = non localise. */
  geo_precision: 'exact' | 'approximatif' | null;
  lead_id: string | null;
  notes: string | null;
  sms_consent: boolean;
  email_consent: boolean;
  unsubscribed: boolean;
  /** Identifiants et metadonnees conserves pour un import Onify idempotent. */
  onify_customer_id?: string | null;
  onify_external_id?: string | null;
  onify_source?: string | null;
  onify_stage?: string | null;
  onify_tags?: unknown[] | null;
  onify_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  lead_id: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  registration: string | null;
  vin: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Insurer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Ligne de declaration de sinistre, distincte du standard. */
  claims_phone: string | null;
  claims_email: string | null;
  /** Numero de convention conditionnant la prise en charge directe. */
  agreement_number: string | null;
  /** Franchise habituelle en euros, quand un seul montant s'applique. */
  default_franchise: number | null;
  /**
   * Regle de franchise telle qu'ecrite sur la carte verte. Un nombre seul
   * serait faux : « 25% du montant » ou « BG = 0 / BGB = 50 » ne s'y reduisent
   * pas.
   */
  franchise_texte: string | null;
  /** Marche a suivre avant le rendez-vous : photos, devis, accords prealables. */
  avant_rdv: string | null;
  /** Le jour meme : declaration, numero de sinistre, contraintes d'horaire. */
  jour_rdv: string | null;
  /** Apres : ou envoyer la facture et sous quelle forme. */
  apres_rdv: string | null;
  /** Le client doit etre en ligne pour obtenir le numero de sinistre. */
  client_present: boolean;
  /** Immobilise le vehicule a la journee, rendez-vous a 8h30. */
  expertise_obligatoire: boolean;
  /** Variantes de nom, pour retrouver la compagnie depuis un texte libre. */
  tags: string[];
  notes: string | null;
  /** false retire l'assureur des listes sans casser les dossiers existants. */
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface WindscreenCase {
  id: string;
  workspace_id: string;
  case_number: string;
  lead_id: string | null;
  contact_id: string | null;
  vehicle_id: string | null;
  insurer_id: string | null;
  assigned_user_id: string | null;
  technician_id: string | null;
  status: CaseStatus;
  intervention_address: string | null;
  intervention_type: 'home' | 'workshop' | null;
  appointment_date: string | null;
  glass_type: string | null;
  has_sensors: boolean;
  has_adas_camera: boolean;
  insurance_contract_number: string | null;
  insurance_claim_number: string | null;
  franchise_amount: number;
  offer: string | null;
  gift_type: string | null;
  gift_amount: number;
  estimated_margin: number;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDocument {
  id: string;
  workspace_id: string;
  case_id: string;
  type: DocumentType;
  label: string;
  uploaded: boolean;
  file_url: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  workspace_id: string;
  case_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  address: string | null;
  type: AppointmentType;
  status: AppointmentStatus;
  /**
   * Coordonnées du lieu du rendez-vous, distinctes de celles du lead :
   * une intervention peut avoir lieu ailleurs qu'au domicile du client.
   * `null` = non localisé, le rendez-vous n'apparaît pas sur la carte.
   */
  citycode: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: 'exact' | 'approximatif' | null;
  /** Evénement miroir créé dans Google Agenda. */
  google_calendar_event_id: string | null;
  google_calendar_html_link: string | null;
  google_calendar_updated_at: string | null;
  google_calendar_payload_hash: string | null;
  google_calendar_origin: 'crm' | 'google' | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  case_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  case_id: string | null;
  contact_id: string | null;
  user_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  workspace_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Communication {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  case_id: string | null;
  contact_id: string | null;
  user_id: string | null;
  type: CommunicationType;
  direction: 'inbound' | 'outbound';
  status: CommunicationStatus;
  content: string | null;
  subject: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  provider: string;
  external_id: string | null;
  delivered_at: string | null;
  sender_email: string | null;
  recipient_email: string | null;
  email_message_id: string | null;
  email_in_reply_to: string | null;
  email_attachments: Array<{
    id: string;
    filename: string;
    content_type: string | null;
    size?: number | null;
  }>;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  workspace_id: string;
  name: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  link: string | null;
  workflow_id?: string | null;
  dedup_key?: string | null;
  created_at: string;
}

export interface Workflow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: unknown[];
  actions: unknown[];
  flow_data: Record<string, unknown>;
  enabled: boolean;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workspace_id: string;
  workflow_id: string;
  entity_type: string | null;
  entity_id: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'retry';
  error_message: string | null;
  execution_log: unknown[];
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowAlertRunResult {
  workflows_checked: number;
  notifications_created: number;
  checked_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  channel: 'sms' | 'email';
  template_id: string | null;
  audience_filter: Record<string, unknown>;
  scheduled_at: string | null;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  reply_count: number;
  conversion_count: number;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  workspace_id: string;
  case_id: string | null;
  contact_id: string | null;
  quote_number: string;
  amount_ht: number;
  tva_rate: number;
  amount_ttc: number;
  franchise_amount: number;
  status: QuoteStatus;
  onify_quote_id?: string | null;
  onify_payload?: Record<string, unknown> | null;
  onify_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  case_id: string | null;
  contact_id: string | null;
  invoice_number: string;
  amount_ht: number;
  tva_rate: number;
  amount_ttc: number;
  franchise_amount: number;
  insurance_amount: number;
  gift_amount: number;
  estimated_margin: number;
  amount_paid: number;
  remaining_amount: number;
  issue_date: string;
  due_date: string | null;
  payment_date: string | null;
  status: InvoiceStatus;
  onify_invoice_id?: string | null;
  onify_payload?: Record<string, unknown> | null;
  onify_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnifyCreditNote {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  invoice_id: string | null;
  onify_credit_id: string;
  credit_number: string | null;
  invoice_number: string | null;
  object: string | null;
  status: string | null;
  amount_ttc: number;
  issue_date: string | null;
  onify_payload: Record<string, unknown> | null;
  onify_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  case_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference: string | null;
  created_at: string;
}

export interface Gift {
  id: string;
  workspace_id: string;
  case_id: string | null;
  contact_id: string | null;
  type: 'gift' | 'transfer';
  description: string | null;
  amount: number;
  status: GiftStatus;
  given_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AfterSalesCase {
  id: string;
  workspace_id: string;
  case_id: string | null;
  contact_id: string | null;
  reason: string | null;
  description: string | null;
  status: AfterSalesStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaFieldMapping {
  [metaFieldName: string]: LeadFieldKey | 'ignore' | 'custom';
}

export type LeadFieldKey =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'phone'
  | 'email'
  | 'city'
  | 'vehicle_registration'
  | 'vehicle_make'
  | 'vehicle_model'
  | 'insurance'
  | 'offer';
