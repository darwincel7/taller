
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { InventoryPart, WikiArticle, parseInventoryCategory } from '../types';

interface InventoryContextType {
  inventory: InventoryPart[];
  wikiArticles: WikiArticle[];
  fetchInventory: () => Promise<void>;
  addInventoryPart: (part: Partial<InventoryPart>) => Promise<InventoryPart | null>;
  updateInventoryPart: (id: string, updates: Partial<InventoryPart>) => Promise<void>;
  adjustStock: (id: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string) => Promise<boolean>;
  deleteInventoryPart: (id: string) => Promise<void>;
  fetchWiki: () => Promise<void>;
  addWikiArticle: (article: Partial<WikiArticle>) => Promise<void>;
  consumePart: (id: string, quantity: number, orderId?: string, orderDetails?: string) => Promise<boolean>; 
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [inventory, setInventory] = useState<InventoryPart[]>([]);
  const [wikiArticles, setWikiArticles] = useState<WikiArticle[]>([]);

  const fetchInventory = async () => {
    if (!supabase) return;
    // Hide archived items by default
    const { data } = await supabase.from('inventory_parts')
      .select('*')
      .is('deleted_at', null)
      .neq('status', 'archived')
      .order('name');
    if (data) setInventory(data as InventoryPart[]);
  };

  const fetchWiki = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('wiki_articles').select('*').order('title');
    if (data) setWikiArticles(data as WikiArticle[]);
  };

  // Initial Load
  useEffect(() => {
      fetchInventory();
      fetchWiki();

      if (!supabase) return;

      const inventoryChannel = supabase.channel('inventory_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_parts' }, () => {
             fetchInventory();
        })
        .subscribe();

      const wikiChannel = supabase.channel('wiki_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wiki_articles' }, () => {
             fetchWiki();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(inventoryChannel);
        supabase.removeChannel(wikiChannel);
      };
  }, []);

  const addInventoryPart = async (part: Partial<InventoryPart>) => {
      if (!supabase) return null;
      
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'unknown';

      // Using the atomic RPC to create the item
      const { data: newId, error } = await supabase.rpc('create_inventory_item', {
          p_name: part.name,
          p_stock: part.stock || 0,
          p_cost: part.cost || 0,
          p_price: part.price || 0,
          p_category: part.category || '{}',
          p_user_id: userId,
          p_sku: (part as any).sku,
          p_image_url: (part as any).image_url
      });

      if (error) {
          console.error("Error creating inventory item:", error);
          return null;
      }

      if (newId) {
          if (part.category) {
              const parsed = parseInventoryCategory(part.category);
              if (parsed.type === 'PART' && parsed.isExpenseRecorded && part.cost && part.cost > 0) {
                  // Record expense in accounting_transactions
                  await supabase.from('accounting_transactions').insert([{
                      amount: -part.cost,
                      transaction_date: new Date().toISOString().split('T')[0],
                      description: `Compra de inventario: ${part.name}`,
                      category_id: '47c20ad7-8947-46ce-8f27-7cfd7b13c2eb',
                      vendor: 'Inventario',
                      status: 'COMPLETED',
                      source: 'INVENTORY',
                      expense_destination: 'STORE',
                      created_by: userId
                  }]);
              }
          }
          
          fetchInventory();
          // Small delay to ensure DB propagation before fetching single
          const { data } = await supabase.from('inventory_parts').select('*').eq('id', newId).single();
          return data;
      }
      
      return null;
  };

  const updateInventoryPart = async (id: string, updates: Partial<InventoryPart>) => {
      if (!supabase) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';

      // If updates include stock, we should probably warn or block it if not using adjustStock
      // but to maintain compatibility we'll allow it but log it as a warning in audit
      if (updates.stock !== undefined) {
          console.warn("Direct stock update detected. Use adjustStock for a cleaner audit trail.");
      }

      await supabase.from('inventory_parts').update(updates).eq('id', id);

      const changes = Object.keys(updates).filter(k => k !== 'id').join(', ');
      
      await supabase.from('audit_logs').insert([{
          action: 'INVENTORY_UPDATED',
          details: `[INV_ID: ${id}] Inventario actualizado: Modificó ${changes}`,
          user_id: user?.id,
          user_name: userName,
          created_at: Date.now()
      }]);

      fetchInventory();
  };

  const adjustStock = async (id: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string): Promise<boolean> => {
      if (!supabase) return false;
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.rpc('adjust_inventory_stock', {
          p_item_id: id,
          p_quantity: quantity,
          p_movement_type: type,
          p_reason: reason,
          p_user_id: user?.id
      });

      if (error) {
          console.error("Error adjusting stock:", error);
          return false;
      }
      
      fetchInventory();
      return !!data;
  };

  const deleteInventoryPart = async (id: string) => {
      if (!supabase) return;

      const part = inventory.find(p => p.id === id);
      const name = part ? part.name : 'Desconocido';

      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';

      // Phase 1 calls for Soft Delete
      await supabase.from('inventory_parts').update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          status: 'archived'
      }).eq('id', id);

      await supabase.from('audit_logs').insert([{
          action: 'INVENTORY_DELETED',
          details: `[INV_ID: ${id}] Archivado (Soft-Delete): El artículo ${name} fue movido a archivo.`,
          user_id: user?.id,
          user_name: userName,
          created_at: Date.now()
      }]);

      fetchInventory();
  };

  const addWikiArticle = async (article: Partial<WikiArticle>) => {
      if (!supabase) return;
      await supabase.from('wiki_articles').insert([{ ...article, created_at: Date.now() }]);
      fetchWiki();
  };

  const consumePart = async (id: string, quantity: number, orderId?: string, orderDetails?: string): Promise<boolean> => {
      if (!supabase) return false;
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.rpc('consume_inventory_item', {
          p_item_id: id,
          p_quantity: quantity,
          p_source_type: orderId ? 'ORDER' : 'MANUAL',
          p_source_id: orderId || null,
          p_reason: `Consumo para ${orderDetails || 'operación general'}`,
          p_user_id: user?.id,
          p_order_details: orderDetails
      });

      if (error) {
          console.error("Error consuming part:", error);
          return false;
      }

      fetchInventory();
      return !!data;
  };

  return (
    <InventoryContext.Provider value={{ 
        inventory, wikiArticles, 
        fetchInventory, addInventoryPart, updateInventoryPart, adjustStock, deleteInventoryPart,
        fetchWiki, addWikiArticle, consumePart
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory must be used within an InventoryProvider');
  return context;
};