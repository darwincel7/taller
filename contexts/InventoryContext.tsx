
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
  deleteMultipleInventoryParts: (ids: string[]) => Promise<void>;
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
      .limit(10000)
      .order('created_at', { ascending: false });
    
    if (data) {
        setInventory(data.filter((item: any) => !item.deleted_at && item.status !== 'archived') as InventoryPart[]);
    }
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

      // Using the atomic RPC to create the item, or fallback to manual insert
      let newId = null;
      const { data: rpcId, error: rpcError } = await supabase.rpc('create_inventory_item', {
          p_name: part.name,
          p_stock: part.stock || 0,
          p_cost: part.cost || 0,
          p_price: part.price || 0,
          p_category: part.category || '{}',
          p_user_id: userId,
          p_sku: (part as any).sku,
          p_image_url: (part as any).image_url
      });

      if (!rpcError && rpcId) {
          newId = rpcId;
      } else {
          console.warn("RPC create_inventory_item failed or missing, falling back to direct insert. Error:", rpcError);
          // Fallback to manual insert
          let finalCategoryJSON = part.category ? JSON.parse(part.category) : {};
          finalCategoryJSON.readableIdFallback = Math.floor(Math.random() * 9000) + 1000;
          if ((part as any).sku) finalCategoryJSON.sku = (part as any).sku;
          if ((part as any).image_url) finalCategoryJSON.imageUrl = (part as any).image_url;
          
          const { data: insertData, error: insertError } = await supabase.from('inventory_parts').insert([{
              name: part.name,
              stock: part.stock || 0,
              cost: part.cost || 0,
              price: part.price || 0,
              category: JSON.stringify(finalCategoryJSON)
          }]).select('id').single();

          if (insertError) {
              console.error("Manual insert failed:", insertError);
              throw new Error("Database error (insert): " + insertError.message);
          }
          newId = insertData?.id;

          if (newId && (part.stock || 0) > 0) {
              await supabase.from('inventory_movements').insert([{
                  item_id: newId,
                  movement_type: 'IN',
                  quantity: part.stock || 0,
                  before_stock: 0,
                  after_stock: part.stock || 0,
                  unit_cost: part.cost || 0,
                  reason: 'Carga inicial de inventario',
                  created_by: userId
              }]);
          }
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

      // Optimistic update
      setInventory(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
      
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';

      // Phase 1.1: Bloquear stock directo
      if (updates.stock !== undefined) {
          delete updates.stock;
          console.warn("Direct stock update blocked. Use adjustStock for a cleaner audit trail.");
          
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_STOCK_DIRECT_EDIT_BLOCKED',
              details: `[INV_ID: ${id}] Intento bloqueado de editar stock directamente en actualización de artículo.`,
              user_id: user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);
      }

      if (Object.keys(updates).length === 0) return;

      // ... keep running async updates without blocking UI
      supabase.from('inventory_parts').update(updates).eq('id', id).then(async () => {
          const changes = Object.keys(updates).filter(k => k !== 'id').join(', ');
          
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_UPDATED',
              details: `[INV_ID: ${id}] Inventario actualizado: Modificó ${changes}`,
              user_id: user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);
      });
  };

  const adjustStock = async (id: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string): Promise<boolean> => {
      if (!supabase) return false;
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';
      
      try {
          // 1. Fetch current item state
          const { data: item, error: fetchError } = await supabase
              .from('inventory_parts')
              .select('stock, cost')
              .eq('id', id)
              .single();
              
          if (fetchError || !item) {
              console.error("Item not found for stock adjustment");
              return false;
          }

          // 2. Calculate new stock
          const delta = type === 'OUT' ? -quantity : quantity;
          const newStock = item.stock + delta;

          // 3. Update stock directly in parts table
          const { error: updateError } = await supabase
              .from('inventory_parts')
              .update({ stock: newStock, updated_at: new Date().toISOString() })
              .eq('id', id);

          if (updateError) {
              console.error("Error updating stock directly:", updateError);
              return false;
          }

          // 4. Create movement record
          const { error: movementError } = await supabase
              .from('inventory_movements')
              .insert([{
                  item_id: id,
                  movement_type: type,
                  quantity: quantity,
                  before_stock: item.stock,
                  after_stock: newStock,
                  unit_cost: item.cost,
                  reason: reason,
                  created_by: user?.id || 'system'
              }]);

          if (movementError) {
              console.warn("Stock updated but could not write movement log:", movementError);
          }
          
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_STOCK_ADJUSTED',
              details: `[INV_ID: ${id}] Ajuste de Stock (${type}): ${quantity} unidades. Razón: ${reason}. Anterior: ${item.stock}, Nuevo: ${newStock}`,
              user_id: user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);

          fetchInventory();
          return true;
      } catch (err) {
          console.error("Exception during stock adjust:", err);
          return false;
      }
  };

  const deleteInventoryPart = async (id: string) => {
      if (!supabase) return;

      const part = inventory.find(p => p.id === id);
      const name = part ? part.name : 'Desconocido';

      // Optimistic update
      setInventory(prev => prev.filter(p => p.id !== id));

      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';

      // Phase 1 calls for Soft Delete
      supabase.from('inventory_parts').update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          status: 'archived'
      }).eq('id', id).then(async () => {
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_DELETED',
              details: `[INV_ID: ${id}] Archivado (Soft-Delete): El artículo ${name} fue movido a archivo.`,
              user_id: user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);
      });
  };

  const deleteMultipleInventoryParts = async (ids: string[]) => {
      if (!supabase || ids.length === 0) return;

      // Optimistic update
      setInventory(prev => prev.filter(p => !ids.includes(p.id)));

      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Sistema';

      supabase.from('inventory_parts').update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          status: 'archived'
      }).in('id', ids).then(async () => {
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_BULK_DELETED',
              details: `Archivado masivo (Soft-Delete): ${ids.length} artículos fueron movidos a archivo.`,
              user_id: user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);
      });
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
          p_user_id: user?.id || null,
          p_order_details: orderDetails || null
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
        fetchInventory, addInventoryPart, updateInventoryPart, adjustStock, deleteInventoryPart, deleteMultipleInventoryParts,
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