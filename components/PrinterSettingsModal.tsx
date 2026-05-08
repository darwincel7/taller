import React, { useState, useEffect } from 'react';
import { X, Printer, RefreshCw, Save, AlertCircle } from 'lucide-react';
import { getPrinters } from '../services/qzService';
import { toast } from 'sonner';

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({ isOpen, onClose }) => {
  const [printers, setPrinters] = useState<string[]>([]);
  const [labelPrinter, setLabelPrinter] = useState<string>('');
  const [receiptPrinter, setReceiptPrinter] = useState<string>('');
  const [useRawPrinting, setUseRawPrinting] = useState<boolean>(false);
  const [labelPrinterLanguage, setLabelPrinterLanguage] = useState<'ESCPOS' | 'TSPL'>('ESCPOS');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrinters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await getPrinters();
      setPrinters(list);
      
      const savedLabel = localStorage.getItem('labelPrinterName');
      const savedReceipt = localStorage.getItem('receiptPrinterName');
      const savedRaw = localStorage.getItem('useRawPrinting') === 'true';
      const savedLang = localStorage.getItem('labelPrinterLanguage') as 'ESCPOS' | 'TSPL' || 'ESCPOS';
      
      setUseRawPrinting(savedRaw);
      setLabelPrinterLanguage(savedLang);

      if (savedLabel && list.includes(savedLabel)) setLabelPrinter(savedLabel);
      else if (savedLabel) setLabelPrinter(savedLabel); // Keep it even if not found, might be offline
      
      if (savedReceipt && list.includes(savedReceipt)) setReceiptPrinter(savedReceipt);
      else if (savedReceipt) setReceiptPrinter(savedReceipt);
      
    } catch (err: any) {
      if (err?.message === 'QZ_TRAY_TIMEOUT' || err?.message === 'QZ_TRAY_NOT_RUNNING') {
        console.warn("QZ Tray not detected (expected if not installed).");
        setError("QZ Tray no está ejecutándose. Ábrelo en tu computadora para detectar impresoras.");
      } else {
        console.warn("Error loading printers:", err);
        setError("No se pudo conectar con QZ Tray. Asegúrate de que esté abierto.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPrinters();
    }
  }, [isOpen]);

  const handleSave = () => {
    if (labelPrinter) localStorage.setItem('labelPrinterName', labelPrinter);
    else localStorage.removeItem('labelPrinterName');
    
    if (receiptPrinter) localStorage.setItem('receiptPrinterName', receiptPrinter);
    else localStorage.removeItem('receiptPrinterName');
    
    localStorage.setItem('useRawPrinting', useRawPrinting.toString());
    localStorage.setItem('labelPrinterLanguage', labelPrinterLanguage);
    
    toast.success("Configuración de impresoras guardada");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Impresoras Locales</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error de conexión</p>
                <p className="opacity-90">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Impresora de Etiquetas (Stickers/QR)
              </label>
              <select
                value={labelPrinter}
                onChange={(e) => setLabelPrinter(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 dark:text-slate-200"
              >
                <option value="">-- Seleccionar Impresora --</option>
                {printers.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {labelPrinter && !printers.includes(labelPrinter) && (
                  <option value={labelPrinter}>{labelPrinter} (Desconectada)</option>
                )}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Se usará para imprimir etiquetas de 50x30mm en el diseñador y códigos QR de las órdenes.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Impresora de Recibos (Facturas/Tickets)
              </label>
              <select
                value={receiptPrinter}
                onChange={(e) => setReceiptPrinter(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 dark:text-slate-200"
              >
                <option value="">-- Seleccionar Impresora --</option>
                {printers.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {receiptPrinter && !printers.includes(receiptPrinter) && (
                  <option value={receiptPrinter}>{receiptPrinter} (Desconectada)</option>
                )}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Se usará para imprimir recibos de 80mm en nuevas órdenes, abonos y entregas.
              </p>
            </div>

            <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  id="useRawPrinting"
                  type="checkbox"
                  checked={useRawPrinting}
                  onChange={(e) => setUseRawPrinting(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="useRawPrinting" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Usar Impresión RAW (ESC/POS)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Recomendado. Envía comandos de texto puro a la impresora. Es mucho más rápido, nítido y evita problemas de márgenes o letras gigantes en macOS/Windows.
                </p>
              </div>
            </div>

            {useRawPrinting && (
              <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Lenguaje de Impresora de Etiquetas (RAW)
                </label>
                <select
                  value={labelPrinterLanguage}
                  onChange={(e) => setLabelPrinterLanguage(e.target.value as 'ESCPOS' | 'TSPL')}
                  className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 dark:text-slate-200"
                >
                  <option value="ESCPOS">ESC/POS (Impresoras de recibos, POS80)</option>
                  <option value="TSPL">TSPL (Impresoras de etiquetas, Xprinter, 2connet 365B)</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Si tus etiquetas no imprimen NADA en modo RAW, cambia esto a TSPL. Las impresoras de etiquetas usan un lenguaje distinto a las de recibos.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <button
            onClick={loadPrinters}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
