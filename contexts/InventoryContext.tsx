
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { InventoryPart, WikiArticle } from '../types';

interface InventoryContextType {
  inventory: InventoryPart[];
  wikiArticles: WikiArticle[];
  fetchInventory: () => Promise<void>;
  addInventoryPart: (part: Partial<InventoryPart>) => Promise<void>;
  updateInventoryPart: (id: string, updates: Partial<InventoryPart>) => Promise<void>;
  deleteInventoryPart: (id: string) => Promise<void>;
  fetchWiki: () => Promise<void>;
  addWikiArticle: (article: Partial<WikiArticle>) => Promise<void>;
  consumePart: (id: string, quantity: number) => Promise<boolean>; // Logic for auto-decrement
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
  }, []);

  const addInventoryPart = async (part: Partial<InventoryPart>) => {
      if (!supabase) return;
      await supabase.from('inventory_parts').insert([part]);
      fetchInventory();
  };

  const updateInventoryPart = async (id: string, updates: Partial<InventoryPart>) => {
      if (!supabase) return;
      await supabase.from('inventory_parts').update(updates).eq('id', id);
      fetchInventory();
  };

  const deleteInventoryPart = async (id: string) => {
      if (!supabase) return;
      await supabase.from('inventory_parts').delete().eq('id', id);
      fetchInventory();
  };

  const addWikiArticle = async (article: Partial<WikiArticle>) => {
      if (!supabase) return;
      await supabase.from('wiki_articles').insert([{ ...article, created_at: Date.now() }]);
      fetchWiki();
  };

  const consumePart = async (id: string, quantity: number): Promise<boolean> => {
      if (!supabase) return false;
      const part = inventory.find(p => p.id === id);
      if (!part || part.stock < quantity) return false;
      
      const newStock = part.stock - quantity;
      await updateInventoryPart(id, { stock: newStock });
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