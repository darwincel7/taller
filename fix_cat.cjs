const fs = require("fs");
let code = fs.readFileSync("pages/Dashboard.tsx", "utf8");

const oldCat = "              const isOrder = item.metadata?.type === 'ORDER';\n              const cat = isOrder ? `Taller (${branch})` : `Inventario (${branch})`;";
              
const newCat = "              const isOrder = item.metadata?.type === 'ORDER' || item.metadata?.type === 'SERVICE' || item.source_type === 'WORKSHOP' || (item.name || item.description || '').toLowerCase().includes('reparación') || (item.name || item.description || '').toLowerCase().includes('servicio');\n              const cat = isOrder ? `Taller (${branch})` : `Inventario (${branch})`;";

code = code.replace(oldCat, newCat);
fs.writeFileSync("pages/Dashboard.tsx", code);
