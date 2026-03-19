
import { supabase } from './supabase';

export const auditService = {
  async recordLog(user: { id: string, name: string }, action: string, details: string, orderId?: string) {
    if (!supabase) return;
    
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert([{
          user_id: user.id,
          user_name: user.name,
          action,
          details,
          order_id: orderId,
          created_at: Date.now()
        }]);
        
      if (error) console.error("Error recording audit log:", error);
    } catch (error) {
      console.error("Audit log exception:", error);
    }
  }
};
