const fs = require("fs");
const content = fs.readFileSync("pages/Dashboard.tsx", "utf8");

const targetExplodedList = `                         {selectedTransaction.is_item_exploded ? (
                             <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                <div className="p-4 bg-white hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{selectedTransaction.description || 'Artículo / Reparación'}</p>
                                            <div className="flex gap-2 items-center mt-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">ID: {selectedTransaction.id?.substring(0,8) || 'N/A'}</span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">CANT: {selectedTransaction.quantity || 1}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <p className="font-black text-slate-800">\${Number(selectedTransaction.gross_amount || 0).toLocaleString()}</p>
                                            <p className="text-xs text-slate-400 font-medium">Costo: \${Number(selectedTransaction.cost_amount || 0).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex justify-between items-center text-xs border-t border-slate-100 pt-3">
                                        <div className="flex gap-4">
                                            <span className="text-slate-500"><strong className="text-slate-700">Tipo:</strong> {selectedTransaction.metadata?.type || selectedTransaction.source_type || "N/A"}</span>
                                        </div>
                                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                            +\${Number(selectedTransaction.net_profit || 0).toLocaleString()} Ganancia
                                        </span>
                                    </div>
                                </div>
                             </div>
                         ) : selectedTransaction.order_expenses && selectedTransaction.order_expenses.length > 0 ? (`;
                         
const newList = `                         {selectedTransaction.is_item_exploded && selectedTransaction.receipt_items ? (
                             <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                {selectedTransaction.receipt_items.map((item: any, i: number) => (
                                <div key={i} className="p-4 bg-white hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{item.name || item.description || "Artículo / Reparación"}</p>
                                            <div className="flex gap-2 items-center mt-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">ID: {item.id?.substring(0,8) || "N/A"}</span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">CANT: {item.quantity || 1}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <p className="font-black text-slate-800">\${Number(item.total_price || item.gross_amount || 0).toLocaleString()}</p>
                                            <p className="text-xs text-slate-400 font-medium">Costo: \${Number(item.total_cost || item.cost_amount || 0).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex justify-between items-center text-xs border-t border-slate-100 pt-3">
                                        <div className="flex gap-4">
                                            <span className="text-slate-500"><strong className="text-slate-700">Tipo:</strong> {item.metadata?.type || selectedTransaction.source_type || "N/A"}</span>
                                            {(item.metadata?.worker_id || item.metadata?.technician_id) && (
                                                <span className="text-slate-500 flex items-center gap-1"><User className="w-3 h-3"/> {item.metadata?.worker_id || item.metadata?.technician_id}</span>
                                            )}
                                        </div>
                                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                            +\${Number(item.profit || item.net_profit || 0).toLocaleString()} Ganancia
                                        </span>
                                    </div>
                                </div>
                                ))}
                             </div>
                         ) : selectedTransaction.order_expenses && selectedTransaction.order_expenses.length > 0 ? (`;
                         
let patched = content.replace(targetExplodedList, newList);

if (patched !== content) {
    fs.writeFileSync("pages/Dashboard.tsx", patched);
    console.log("Patched list");
} else {
    console.log("Not found list");
}
