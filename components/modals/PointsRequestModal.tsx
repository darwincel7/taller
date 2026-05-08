
import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, Split, Loader2 } from 'lucide-react';
import { UserRole, PointSplit, OrderType } from '../../types';

interface PointsRequestModalProps {
    users: any[];
    currentUser: any;
    orderType?: OrderType;
    onConfirm: (points: number, reason: string, split?: PointSplit) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export const PointsRequestModal: React.FC<PointsRequestModalProps> = ({ users, currentUser, orderType, onConfirm, onCancel, isSubmitting }) => {
    const [pts, setPts] = useState(orderType === OrderType.WARRANTY ? 0 : 1);
    const [isSplit, setIsSplit] = useState(false);
    const [partnerId, setPartnerId] = useState('');
    const [myShare, setMyShare] = useState(1); 
    const [reason, setReason] = useState('');

    const availablePartners = users.filter((u: any) => u.role === UserRole.TECHNICIAN && u.id !== currentUser.id);

    useEffect(() => {
        if (pts < 2) {
            setIsSplit(false);
            setReason('');
        }
        if (pts >= 2 && !isSplit) {
            setMyShare(Math.floor(pts / 2));
        }
    }, [pts]);

    const handleConfirm = () => {
        if (pts >= 2 && !reason.trim()) {
            alert("Por favor indica la razón para solicitar 2 o más puntos.");
            return;
        }

        if (isSplit && partnerId) {
            const splitData: PointSplit = {
                primaryTechId: currentUser.id,
                primaryPoints: myShare,
                secondaryTechId: partnerId,
                secondaryPoints: pts - myShare
            };
            onConfirm(pts, reason || "Reparación Colaborativa", splitData);
        } else {
            const finalReason = pts === 0 ? "Reparación sin costo/puntos" : (reason || "Reparación Estándar");
            onConfirm(pts, finalReason);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in zoom-in" onClick={onCancel}>
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                <button onClick={onCancel} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5 text-slate-500"/></button>
                
                <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-slate-800 flex items-center justify-center gap-2">
                        {pts === 0 ? '🚫 Sin Puntos' : '¡Reparación Lista!'}
                    </h3>
                    <p className="text-slate-500 text-sm">
                        {orderType === OrderType.WARRANTY 
                            ? 'Las garantías no generan puntos por defecto. ¿Deseas solicitar puntos por este caso extraordinario?' 
                            : '¿Cuántos puntos exige este trabajo?'}
                    </p>
                </div>

                <div className="flex items-center justify-center gap-6 mb-8">
                    <button onClick={() => setPts(Math.max(0, pts - 1))} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition active:scale-90 border border-slate-200 shadow-sm"><Minus className="w-6 h-6"/></button>
                    <div className="w-24 text-center">
                        <span className="text-6xl font-black text-blue-600">{pts}</span>
                    </div>
                    <button onClick={() => setPts(pts + 1)} className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 text-blue-600 transition active:scale-90 border border-blue-200 shadow-sm"><Plus className="w-6 h-6"/></button>
                </div>

                {pts >= 2 && (
                    <div className="mb-6 space-y-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Razón de la solicitud ({pts} puntos)</label>
                            <textarea
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                placeholder="Explica por qué esta reparación requiere más puntos..."
                                rows={2}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <label className="flex items-center justify-between cursor-pointer group">
                                <span className="flex items-center gap-2 font-bold text-slate-700 text-sm"><Split className="w-4 h-4 text-purple-500"/> Dividir con compañero</span>
                                <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${isSplit ? 'bg-purple-600' : 'bg-slate-300'}`} onClick={() => setIsSplit(!isSplit)}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isSplit ? 'translate-x-6' : 'translate-x-0'}`}/>
                                </div>
                            </label>

                            {isSplit && (
                                <div className="mt-4 animate-in slide-in-from-top-2">
                                    <div className="mb-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Compañero</label>
                                        <select 
                                            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-purple-200"
                                            value={partnerId}
                                            onChange={(e) => setPartnerId(e.target.value)}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {availablePartners.map((u: any) => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {partnerId && (
                                        <div>
                                            <div className="flex justify-between text-xs font-bold mb-2">
                                                <span className="text-blue-600">Yo: {myShare}</span>
                                                <span className="text-purple-600">El: {pts - myShare}</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="1" 
                                                max={pts - 1} 
                                                value={myShare} 
                                                onChange={(e) => setMyShare(parseInt(e.target.value))}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onCancel} disabled={isSubmitting} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition disabled:opacity-50">Cancelar</button>
                    <button 
                        onClick={handleConfirm}
                        disabled={(isSplit && !partnerId) || isSubmitting || (pts >= 2 && !reason.trim())}
                        className={`flex-[2] py-4 rounded-xl text-white font-bold shadow-lg transition active:scale-95 flex items-center justify-center gap-2 ${pts === 0 ? 'bg-slate-700 hover:bg-slate-800' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (pts === 0 ? 'Reparación sin Costo' : `Confirmar (${pts} pts)`)}
                    </button>
                </div>
            </div>
        </div>
    );
};
