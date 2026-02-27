
import React from 'react';
import { ArrowRight } from 'lucide-react';

interface ProgressNotesProps {
  note: string;
  setNote: (val: string) => void;
  onSave: () => void;
}

export const ProgressNotes: React.FC<ProgressNotesProps> = ({ note, setNote, onSave }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h3 className="font-bold text-blue-600 text-sm uppercase mb-4 flex items-center gap-2">
        <ArrowRight className="w-4 h-4"/> NOTAS DE AVANCES
      </h3>
      <textarea 
        className="w-full p-4 bg-slate-50 border rounded-2xl text-sm min-h-[150px] outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium mb-4"
        placeholder="Escribe aquí los avances..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end">
        <button onClick={onSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition">
          GUARDAR BITÁCORA
        </button>
      </div>
    </div>
  );
};
