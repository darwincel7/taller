import { supabase } from './supabase';

export interface LabelConfig {
  name: string;
  offset_x: number;
  offset_y: number;
  scale: number;
}

const STORAGE_KEY = 'label_configs';

export const labelConfigService = {
  async getConfig(name: string): Promise<LabelConfig | null> {
    try {
      // Try Supabase first
      const { data, error } = await supabase
        .from('label_configs')
        .select('*')
        .eq('name', name)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as LabelConfig;
      }
    } catch (e) {
      console.warn('Supabase label_configs not available, falling back to localStorage');
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const configs: Record<string, LabelConfig> = JSON.parse(stored);
      return configs[name] || null;
    } catch (e) {
      console.warn('Error reading label config from localStorage:', e);
      return null;
    }
  },

  async getAllConfigs(): Promise<LabelConfig[]> {
    try {
      const { data, error } = await supabase
        .from('label_configs')
        .select('*')
        .order('name');

      if (!error && data) {
        // Deduplicate by name
        const unique = new Map<string, LabelConfig>();
        for (const item of data) {
          if (!unique.has(item.name)) {
            unique.set(item.name, item as LabelConfig);
          }
        }
        return Array.from(unique.values());
      }
    } catch (e) {
      console.warn('Supabase label_configs not available, falling back to localStorage');
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const configs: Record<string, LabelConfig> = JSON.parse(stored);
      return Object.values(configs).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn('Error reading label configs from localStorage:', e);
      return [];
    }
  },

  async deleteConfig(name: string): Promise<void> {
    try {
      await supabase
        .from('label_configs')
        .delete()
        .eq('name', name);
    } catch (e) {
      console.warn('Supabase label_configs not available, falling back to localStorage');
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const configs: Record<string, LabelConfig> = JSON.parse(stored);
        delete configs[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
      }
    } catch (e) {
      console.warn('Error deleting label config from localStorage:', e);
    }
  },

  async saveConfig(config: LabelConfig): Promise<void> {
    try {
      // Try Supabase first
      const { data: existing } = await supabase
        .from('label_configs')
        .select('id')
        .eq('name', config.name)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('label_configs')
          .update({
            offset_x: config.offset_x,
            offset_y: config.offset_y,
            scale: config.scale,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('label_configs')
          .insert([config]);
      }
    } catch (e) {
      console.warn('Supabase label_configs not available, falling back to localStorage');
    }

    // Always save to localStorage as fallback
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const configs: Record<string, LabelConfig> = stored ? JSON.parse(stored) : {};
      configs[config.name] = config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch (e) {
      console.warn('Error saving label config to localStorage:', e);
    }
  }
};

