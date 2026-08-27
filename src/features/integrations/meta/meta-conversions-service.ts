import { supabaseUrl } from '@/lib/supabase';

export type ConversionEventType = 'Lead' | 'Contact' | 'Schedule' | 'CompleteRegistration' | 'Purchase';

export interface ConversionEvent {
  event_name: ConversionEventType;
  event_id?: string;
  event_time: number;
  action_source: 'website' | 'app' | 'phone_call' | 'physical_store' | 'system_generated';
  event_source_url?: string;
  user_data: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    country?: string;
    fbp?: string;
    fbc?: string;
    external_id?: string;
  };
  custom_data?: Record<string, unknown>;
}

class MetaConversionsServiceClass {
  private enabled = false;

  setEnabled(value: boolean) {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(event: ConversionEvent): Promise<{ success: boolean; error: string | null }> {
    if (!this.enabled) {
      return { success: false, error: 'Meta Conversions API is not enabled' };
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/meta-conversions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'send', event }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Request failed' }));
        return { success: false, error: data.error || `HTTP ${response.status}` };
      }

      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async sendBatch(events: ConversionEvent[]): Promise<{ success: boolean; error: string | null }> {
    if (!this.enabled) {
      return { success: false, error: 'Meta Conversions API is not enabled' };
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/meta-conversions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'send_batch', events }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Request failed' }));
        return { success: false, error: data.error || `HTTP ${response.status}` };
      }

      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const MetaConversionsService = new MetaConversionsServiceClass();
