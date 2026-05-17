import fs from 'fs';

let code = fs.readFileSync('pages/StoreInventory/StorePurchasesTab.tsx', 'utf8');

// 1. Update formData initial state
const target1 = `  const [formData, setFormData] = useState({
    title: '',
    amount: 0,
    providerId: '',
    isCredit: false,
    creditPaid: false,
    receiptUrl: ''
  });`;

const replace1 = `  const [formData, setFormData] = useState({
    title: '',
    amount: 0,
    providerId: '',
    isCredit: false,
    paymentMethod: 'CASH' as import('../../types').PaymentMethod,
    creditPaid: false,
    receiptUrl: ''
  });`;

const target2 = `      // Reflect expense if it's paid right away
      if (!formData.isCredit || formData.creditPaid) {
          await registerAccountingExpense(formData.title, formData.amount);
      }`;

const replace2 = `      // Reflect expense if it's paid right away
      if (!formData.isCredit || formData.creditPaid) {
          await registerAccountingExpense(formData.title, formData.amount, formData.paymentMethod);
      }`;

const target3 = `              <div className="pt-2 flex items-center gap-3">
                 <input type="checkbox" id="isCredit" checked={formData.isCredit} onChange={e => setFormData({...formData, isCredit: e.target.checked})} className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />
                 <label htmlFor="isCredit" className="font-bold text-slate-700 cursor-pointer">Compra a Crédito (Por pagar)</label>
              </div>`;

const replace3 = `              <div className="pt-2 flex items-center gap-3">
                 <input type="checkbox" id="isCredit" checked={formData.isCredit} onChange={e => setFormData({...formData, isCredit: e.target.checked})} className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />
                 <label htmlFor="isCredit" className="font-bold text-slate-700 cursor-pointer">Compra a Crédito (Por pagar)</label>
              </div>
              {!formData.isCredit && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Método de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                       <label className={"flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors " + (formData.paymentMethod === 'CASH' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200')}>
                          <input type="radio" name="paymentMethod" value="CASH" checked={formData.paymentMethod === 'CASH'} onChange={() => setFormData({...formData, paymentMethod: 'CASH'})} className="hidden" />
                          Efectivo
                       </label>
                       <label className={"flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors " + (formData.paymentMethod === 'TRANSFER' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200')}>
                          <input type="radio" name="paymentMethod" value="TRANSFER" checked={formData.paymentMethod === 'TRANSFER'} onChange={() => setFormData({...formData, paymentMethod: 'TRANSFER'})} className="hidden" />
                          Transferencia
                       </label>
                    </div>
                  </div>
              )}`;

const target4 = `  const registerAccountingExpense = async (title: string, amount: number) => {`;
const replace4 = `  const registerAccountingExpense = async (title: string, amount: number, method: import('../../types').PaymentMethod = 'CASH') => {`;

const target4b = `             expense_destination: ExpenseDestination.STORE,
             source: 'STORE',
             branch: currentUser?.branch || 'T4',
             method: 'CASH'`;
const replace4b = `             expense_destination: ExpenseDestination.STORE,
             source: 'STORE',
             branch: currentUser?.branch || 'T4',
             method: method`;

const target5 = `<p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                     <ShoppingCart className="w-4 h-4" /> Proveedor: <span className="text-slate-700 font-bold">{provider?.name || 'Desconocido'}</span>
                   </p>`;

const replace5 = `<p className="text-slate-500 font-medium flex-wrap flex items-center gap-2 mt-1">
                     <ShoppingCart className="w-4 h-4" /> Proveedor: <span className="text-slate-700 font-bold">{provider?.name || 'Desconocido'}</span>
                     <span className="text-slate-300">•</span>
                     <span className="text-slate-500 font-bold">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'Sin fecha'}</span>
                   </p>`;

const target6 = `  const handlePayCredit = async (id: string, currentCategory: any, cost: number, title: string) => {
    if (confirm("¿Marcar este crédito como pagado (se generará un gasto)?")) {
       await updateInventoryPart(id, {
          category: JSON.stringify({
            ...currentCategory,
            creditPaid: true
          })
       });
       await registerAccountingExpense(title, cost);
       toast.success("Deuda saldada y gasto de contabilidad registrado.");
    }
  };`;

const replace6 = `  const handlePayCredit = async (id: string, currentCategory: any, cost: number, title: string) => {
    const methodStr = prompt("¿Método de pago para saldar esta deuda? (Escribe 'CASH' para efectivo, 'TRANSFER' para transferencia)", "CASH");
    if (!methodStr) return;
    const method = methodStr.toUpperCase() === 'TRANSFER' ? 'TRANSFER' : 'CASH';

    if (confirm("¿Marcar este crédito como pagado usando " + method + " (se generará un gasto)?")) {
       await updateInventoryPart(id, {
          category: JSON.stringify({
            ...currentCategory,
            creditPaid: true
          })
       });
       await registerAccountingExpense(title, cost, method);
       toast.success("Deuda saldada y gasto de contabilidad registrado.");
    }
  };`;

const tReset = `onClick={() => { setFormData({ title: '', amount: 0, providerId: '', isCredit: false, creditPaid: false, receiptUrl: '' }); setIsModalOpen(true); }}`;
const rReset = `onClick={() => { setFormData({ title: '', amount: 0, providerId: '', paymentMethod: 'CASH', isCredit: false, creditPaid: false, receiptUrl: '' }); setIsModalOpen(true); }}`;

code = code.replace(target1, replace1).replace(target2, replace2).replace(target3, replace3).replace(target4, replace4).replace(target4b, replace4b).replace(target5, replace5).replace(target6, replace6).replace(tReset, rReset);

fs.writeFileSync('pages/StoreInventory/StorePurchasesTab.tsx', code);
