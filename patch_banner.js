const fs = require("fs");
const content = fs.readFileSync("pages/StoreInventory/StoreCatalogTab.tsx", "utf8");

const targetStr = `<div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-amber-900 font-black uppercase text-sm tracking-tight">Equipos en espera de validación</h3>
              <p className="text-amber-700 text-xs font-bold">Hay {pendingAcceptanceItems.length} equipos transferidos que precisan revisión, foto, y ser enlazados a su modelo del catálogo.</p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            {pendingAcceptanceItems.slice(0, 3).map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveItemId(item.id)}
                className="flex-1 md:flex-none px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-black text-amber-600 hover:bg-amber-50 transition-all shadow-sm truncate max-w-[150px]"
              >
                {item.name.split(' (')[0]}
              </button>
            ))}
            {pendingAcceptanceItems.length > 3 && (
              <span className="text-xs font-bold text-amber-500 self-center">+{pendingAcceptanceItems.length - 3} más</span>
            )}
          </div>
        </div>`;

const replacementStr = `<div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-amber-900 font-black uppercase text-sm tracking-tight">Equipos en espera de validación</h3>
              <p className="text-amber-700 text-xs font-bold">Hay {pendingAcceptanceItems.length} equipos transferidos que precisan revisión, foto, y ser enlazados a su modelo del catálogo.</p>
            </div>
          </div>
          <div className="flex gap-2 w-full lg:w-auto flex-wrap justify-start lg:justify-end max-h-[200px] overflow-y-auto pr-2">
            {(showAllPending ? pendingAcceptanceItems : pendingAcceptanceItems.slice(0, 3)).map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveItemId(item.id)}
                className="flex-1 md:flex-none px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-black text-amber-600 hover:bg-amber-50 transition-all shadow-sm truncate max-w-[150px]"
              >
                {item.name.split(' (')[0]}
              </button>
            ))}
            {pendingAcceptanceItems.length > 3 && (
              <button 
                onClick={() => setShowAllPending(!showAllPending)}
                className="text-xs font-bold text-amber-600 bg-amber-100/50 hover:bg-amber-200/50 px-3 py-2 rounded-xl transition-colors self-center"
              >
                {showAllPending ? 'Ver menos' : \`+${pendingAcceptanceItems.length - 3} más (Ver todos)\`}
              </button>
            )}
          </div>
        </div>`;

if(content.includes(targetStr)) {
  fs.writeFileSync("pages/StoreInventory/StoreCatalogTab.tsx", content.replace(targetStr, replacementStr));
  console.log("Patched correctly");
} else {
  console.log("Target string not found");
}
