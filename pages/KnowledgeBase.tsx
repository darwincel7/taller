import React, { useState, useEffect } from 'react';
import { useInventory } from '../contexts/InventoryContext';
import { WikiArticle } from '../types';
import { Book, Search, Plus, ChevronDown, ChevronUp, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const KnowledgeBase: React.FC = () => {
  const { wikiArticles, fetchWiki, addWikiArticle } = useInventory();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newArticle, setNewArticle] = useState<Partial<WikiArticle>>({ title: '', model: '', issue: '', solution: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { fetchWiki(); }, []);

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      await addWikiArticle({ ...newArticle, author: currentUser?.name || 'Anon' });
      setIsCreating(false);
      setNewArticle({ title: '', model: '', issue: '', solution: '' });
  };

  const filtered = wikiArticles.filter(a => 
      a.title.toLowerCase().includes(search.toLowerCase()) || 
      a.model.toLowerCase().includes(search.toLowerCase()) || 
      a.issue.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Book className="w-6 h-6"/> Base de Conocimientos</h1>
            <button onClick={() => setIsCreating(!isCreating)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"><Plus className="w-4 h-4"/> Nueva Solución</button>
        </div>

        {isCreating && (
            <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-8 animate-in slide-in-from-top-2">
                <h3 className="font-bold mb-4 text-slate-800">Registrar Solución Técnica</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <input required placeholder="Título (ej. Falla de carga S20)" className="p-2 border rounded bg-white text-slate-900" value={newArticle.title} onChange={e => setNewArticle({...newArticle, title: e.target.value})}/>
                    <input required placeholder="Modelo" className="p-2 border rounded bg-white text-slate-900" value={newArticle.model} onChange={e => setNewArticle({...newArticle, model: e.target.value})}/>
                </div>
                <textarea required placeholder="Descripción del problema..." className="w-full p-2 border rounded mb-4 h-20 bg-white text-slate-900" value={newArticle.issue} onChange={e => setNewArticle({...newArticle, issue: e.target.value})}/>
                <textarea required placeholder="Solución aplicada..." className="w-full p-2 border rounded mb-4 h-32 font-mono text-sm bg-slate-50 text-slate-800" value={newArticle.solution} onChange={e => setNewArticle({...newArticle, solution: e.target.value})}/>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                    <button type="submit" className="px-6 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700">Publicar</button>
                </div>
            </form>
        )}

        <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input className="w-full pl-10 pr-4 py-3 border rounded-xl shadow-sm bg-white text-slate-900" placeholder="Buscar por falla o modelo..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-4">
            {filtered.map(article => (
                <div key={article.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expandedId === article.id ? null : article.id)}>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{article.title}</h3>
                            <div className="flex gap-2 mt-1 text-xs text-slate-500">
                                <span className="bg-slate-100 px-2 py-0.5 rounded border">{article.model}</span>
                                <span className="flex items-center gap-1"><User className="w-3 h-3"/> {article.author}</span>
                            </div>
                        </div>
                        {expandedId === article.id ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                    </div>
                    {expandedId === article.id && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50">
                            <p className="text-sm font-bold text-red-600 mb-1">Problema:</p>
                            <p className="text-sm text-slate-700 mb-4">{article.issue}</p>
                            <p className="text-sm font-bold text-green-600 mb-1">Solución:</p>
                            <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-3 rounded border border-slate-200">{article.solution}</pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
  );
};