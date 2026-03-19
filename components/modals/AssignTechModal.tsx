
import React from 'react';

interface AssignTechModalProps {
    users: any[];
    onClose: () => void;
    onConfirm: (userId: string, name: string) => void;
}

export const AssignTechModal: React.FC<AssignTechModalProps> = ({ users, onClose, onConfirm }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Asignar Técnico</h3>
            {users.map((u:any) => (
                <div 
                    key={u.id} 
                    onClick={() => onConfirm(u.id, u.name)} 
                    className="p-2 hover:bg-slate-100 cursor-pointer rounded transition-colors"
                >
                    {u.name}
                </div>
            ))}
        </div>
    </div>
);
