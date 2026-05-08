
import { supabase } from './supabase';

export const auditService = {
  async recordLog(
    user: { id: string, name: string }, 
    action: string, 
    details: string, 
    orderId?: string,
    entityType?: 'ORDER' | 'USER' | 'TRANSACTION' | 'INVENTORY' | 'SYSTEM' | 'CASH_CLOSING' | 'OBLIGATION' | 'AUDIT',
    entityId?: string,
    metadata?: any
  ) {
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
          entity_type: entityType,
          entity_id: entityId || orderId,
          metadata: metadata || null,
          created_at: Date.now()
        }]);
        
      if (error) console.warn("Error recording audit log:", error);
    } catch (error) {
      console.warn("Audit log exception:", error);
    }
  }
};
