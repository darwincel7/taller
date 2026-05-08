
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { InventoryPart, WikiArticle, parseInventoryCategory } from '../types';

interface InventoryContextType {
  inventory: InventoryPart[];
  wikiArticles: WikiArticle[];
  fetchInventory: () => Promise<void>;
  addInventoryPart: (part: Partial<InventoryPart>) => Promise<InventoryPart | null>;
  updateInventoryPart: (id: string, updates: Partial<InventoryPart>) => Promise<void>;
  deleteInventoryPart: (id: string) => Promise<void>;
  fetchWiki: () => Promise<void>;
  addWikiArticle: (article: Partial<WikiArticle>) => Promise<void>;
  consumePart: (id: string, quantity: number, orderId?: string, orderDetails?: string) => Promise<boolean>; // Logic for auto-decrement
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [inventory, setInventory] = useState<InventoryPart[]>([]);
  const [wikiArticles, setWikiArticles] = useState<WikiArticle[]>([]);

  const fetchInventory = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('inventory_parts').select('*').order('name');
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
      
      // Auto-assign readable_id starting from 1000 if not present (skip for STORE_PRODUCT)
      try {
        let catObj = part.category ? JSON.parse(part.category) : {};
        
        let shouldAssign = true;
        if (catObj.readable_id !== undefined) {
           shouldAssign = false;
        } else if (catObj.type === 'STORE_PRODUCT' && catObj.isCellphone) {
           shouldAssign = false; // Cellphone models don't get ID
        } else if (catObj.type === 'STORE_ITEM' && catObj.isCellphone === false) {
           shouldAssign = false; // Non-cellphone items inherit from their product, they don't get their own ID
        } else if (['STORE_PURCHASE', 'STORE_ATTRIBUTE'].includes(catObj.type)) {
           shouldAssign = false;
        }

        if (shouldAssign) {
            const { data: allItems } = await supabase.from('inventory_parts').select('category');
            let maxId = 999;
            for (const row of allItems || []) {
                try {
                    const c = JSON.parse(row.category || '{}');
                    if (c.readable_id && c.readable_id > maxId) {
                        maxId = c.readable_id;
                    }
                } catch(e) {}
            }
            catObj.readable_id = maxId + 1;
            part.category = JSON.stringify(catObj);
        }
      } catch (e) {
          console.error("Error setting readable_id: ", e);
      }
      
      const { data, error } = await supabase.from('inventory_parts').insert([part]).select().single();
      
      if (data) {
          const { data: userData } = await supabase.auth.getUser();
          const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';

          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_CREATED',
              details: `[INV_ID: ${data.id}] Creado: ${data.name} con stock de ${data.stock} (${data.category ? parseInventoryCategory(data.category).type : ''})`,
              user_id: userData.user?.id,
              user_name: userName,
              created_at: Date.now()
          }]);

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
                      created_by: userData.user?.id
                  }]);
              }
          }
      }
      
      fetchInventory();
      return data;
  };

  const updateInventoryPart = async (id: string, updates: Partial<InventoryPart>) => {
      if (!supabase) return;
      
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';

      await supabase.from('inventory_parts').update(updates).eq('id', id);

      // Extract keys changed to make the log useful
      const changes = Object.keys(updates).filter(k => k !== 'id').join(', ');
      
      // If we are just consuming a part (handled by OrderedFinancials.tsx), don't double log.
      // But updateInventoryPart is also called from the Inventory UI when saving edits!
      // For simplicity, we just log "Inventario actualizado".
      await supabase.from('audit_logs').insert([{
          action: 'INVENTORY_UPDATED',
          details: `[INV_ID: ${id}] Inventario actualizado: Modificó ${changes}`,
          user_id: userData.user?.id,
          user_name: userName,
          created_at: Date.now()
      }]);

      fetchInventory();
  };

  const deleteInventoryPart = async (id: string) => {
      if (!supabase) return;

      const part = inventory.find(p => p.id === id);
      const name = part ? part.name : 'Desconocido';

      const { data: userData } = await supabase.auth.getUser();
      const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';

      await supabase.from('inventory_parts').delete().eq('id', id);

      await supabase.from('audit_logs').insert([{
          action: 'INVENTORY_DELETED',
          details: `[INV_ID: ${id}] Eliminado: El artículo ${name} fue eliminado del inventario.`,
          user_id: userData.user?.id,
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
      const part = inventory.find(p => p.id === id);
      if (!part || part.stock < quantity) return false;
      
      const newStock = part.stock - quantity;
      const updates: Partial<InventoryPart> = { stock: newStock };
      
      const parsed = parseInventoryCategory(part.category) as any;
      if (parsed.type === 'STORE_ITEM') {
          const { data: userData } = await supabase.auth.getUser();
          const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';

          const newHistory = [
              ...(parsed.history || []),
              {
                  action: quantity > 0 ? 'VENDIDO/CONSUMIDO' : 'DEVOLUCIÓN',
                  date: new Date().toISOString(),
                  user: userName,
                  details: `Unidad consumida/vendida (Cantidad: ${quantity}). ${orderDetails || ''} ${orderId ? `Vinculado a Orden/Venta: ${orderId}` : ''}`
              }
          ];

          updates.category = JSON.stringify({
              ...parsed,
              status: newStock <= 0 ? 'SOLD' : parsed.status,
              history: newHistory
          });
      }

      await updateInventoryPart(id, updates);

      // Log the extraction
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';
      
      let details = `[INV_ID: ${id}] Extracción: ${quantity}x ${part.name} ($${part.cost})`;
      if (orderDetails) {
          details += ` para ${orderDetails}`;
      }

      await supabase.from('audit_logs').insert([{
          action: 'INVENTORY_EXTRACTION',
          details: details,
          user_id: userData.user?.id,
          user_name: userName,
          order_id: orderId,
          created_at: Date.now()
      }]);

      return true;
  };

  return (
    <InventoryContext.Provider value={{ 
        inventory, wikiArticles, 
        fetchInventory, addInventoryPart, updateInventoryPart, deleteInventoryPart,
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