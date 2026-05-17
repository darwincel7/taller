const fs = require("fs");
const content = fs.readFileSync("pages/Dashboard.tsx", "utf8");

const targetExplosion = `                  ...sale, // Keep payment method, branch, date
                  ...item, // Overwrite with item specific name, total_price, profit
                  description: item.name,
                  gross_amount: item.total_price,
                  cost_amount: item.total_cost,
                  net_profit: item.profit,
                  is_item_exploded: true,
                  parent_readable_id: sale.readable_id
              };`;
              
const newExplosion = `                  ...sale, // Keep payment method, branch, date
                  ...item, // Overwrite with item specific name, total_price, profit
                  description: item.name,
                  gross_amount: item.total_price,
                  cost_amount: item.total_cost,
                  net_profit: item.profit,
                  is_item_exploded: true,
                  parent_readable_id: sale.readable_id,
                  receipt_total: sale.gross_amount || sale.amount || 0,
                  receipt_items: sale.items || []
              };`;

let patched = content.replace(targetExplosion, newExplosion);

const targetSummary = `                                <span className="text-3xl font-black text-emerald-600">\${Number(selectedTransaction.amount || selectedTransaction.gross_amount || 0).toLocaleString()}</span>
                            </div>
                            
                            {/* Cálculo de Rentabilidad Global */}
                            <div className="text-right">
                                {(() => {
                                    const exps = selectedTransaction.order_expenses || [];
                                    let costOfGoods = exps.reduce((acc: number, e: any) => acc + (e.partCost || 0), 0);
                                    let profit = 0;
                                    let totalAmt = Number(selectedTransaction.amount || selectedTransaction.gross_amount || 0);

                                    if (selectedTransaction.source_type || selectedTransaction.parent_readable_id) {
                                        costOfGoods = Number(selectedTransaction.cost_amount || 0);
                                        profit = Number(selectedTransaction.net_profit || selectedTransaction.profit || 0);
                                    } else if (costOfGoods > 0) {
                                        profit = totalAmt - costOfGoods;
                                    }`;
                                    
const newSummary = `                                <span className="text-3xl font-black text-emerald-600">\${Number(selectedTransaction.receipt_total || selectedTransaction.amount || selectedTransaction.gross_amount || 0).toLocaleString()}</span>
                            </div>
                            
                            {/* Cálculo de Rentabilidad Global */}
                            <div className="text-right">
                                {(() => {
                                    const exps = selectedTransaction.order_expenses || [];
                                    let costOfGoods = exps.reduce((acc: number, e: any) => acc + (e.partCost || 0), 0);
                                    let profit = 0;
                                    let totalAmt = Number(selectedTransaction.receipt_total || selectedTransaction.amount || selectedTransaction.gross_amount || 0);

                                    if (selectedTransaction.is_item_exploded && selectedTransaction.receipt_items) {
                                        // Sum up the total costs and profits of all items in the receipt
                                        costOfGoods = selectedTransaction.receipt_items.reduce((acc, curr) => acc + Number(curr.total_cost || curr.cost_amount || 0), 0);
                                        profit = selectedTransaction.receipt_items.reduce((acc, curr) => acc + Number(curr.profit || curr.net_profit || 0), 0);
                                    } else if (selectedTransaction.source_type || selectedTransaction.parent_readable_id) {
                                        costOfGoods = Number(selectedTransaction.cost_amount || 0);
                                        profit = Number(selectedTransaction.net_profit || selectedTransaction.profit || 0);
                                    } else if (costOfGoods > 0) {
                                        profit = totalAmt - costOfGoods;
                                    }`;

patched = patched.replace(targetSummary, newSummary);

if (patched !== content) {
    fs.writeFileSync("pages/Dashboard.tsx", patched);
    console.log("Patched explosion block 1");
} else {
    console.log("Not found block 1");
}

