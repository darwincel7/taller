const fs = require('fs');
let code = fs.readFileSync('pages/StoreInventory/StorePurchasesTab.tsx', 'utf8');

const t6 = '              <div className="pt-2 flex items-center gap-3">\n                 <input type="checkbox" id="isCredit" checked:{formData.isCredit} onChange={e => setFormData({...formData, isCredit: e.target.checked})} className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />\n                 <label htmlFor="isCredit" className="font-bold text-slate-700 cursor-pointer">Compra a Crédito (Por pagar)</label>\n              </div>';

const r6 = `              <div className="pt-2 flex items-center gap-3">
                 <input type="checkbox" id="isCredit" checked={formData.isCredit} onChange={e => setFormData({...formData, isCredit: e.target.checked})} className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />
                 <label htmlFor="isCredit" className="font-bold text-slate-700 cursor-pointer">Compra a Crédito (Por pagar)</label>
              </div>
              '{!formData.isCredit && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Método de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                       <label className={\`flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors ${ formData.paymentMethod === 'CASH' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200' }\`}>
                          <input type="radio" name="paymentMethod" value="CASH" checked={formData.paymentMethod === 'CASH'} onChange={() => setFormData({...formData, paymentMethod: 'CASH'})} className="hidden" />
                          Efectivo
                       </label>
                       <label className={\`flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors ${ formData.paymentMethod === 'TRANSFER' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200' }\`}>
                          <input type="radio" name="paymentMethod" value="TRANSFER" checked={formData.paymentMethod === 'TRANSFER'} onChange={() => setFormData({...formData, paymentMethod: 'TRANSFER'})} className="hidden" />
                          Transferencia
                       </label>
                    </div>
                  </div>
              )}`;

code = code.replace(t6, r6);

const t7 = `<p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                     <ShoppingCart className="w-4 h-4" /> Proveedor: <span className="text-slate-700 font">{provider?name || 'Desconocido'}</span>
                   </p>`;

const r7 = `<p className="text-slate-500 font-medium flex-wrap flex items-center gap-2 mt-1">
                     <ShoppingCart className="w-4 h-4" /> Proveedor: <span className="text-slate-700 font-bold">{provider?name || 'Desconocido'}</span>
                     <span className="text-slate-300">•</span>
                     <span className="text-slate-500 font-bold">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'Sin fecha'}</span>
                   </p>`;

code = code.replace(t7, r7);

fs.writeFileSync('pages/StoreInventory/StorePurchasesTab.tsx', code);