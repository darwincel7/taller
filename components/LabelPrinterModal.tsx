import React, { useState, useRef, useEffect } from 'react';
import { X, Printer, QrCode as QrCodeIcon, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Eraser, Palette, Highlighter, Undo, Redo, Type, Image as ImageIcon, Move, Save, Trash2, Copy, ArrowUpToLine, ArrowDownToLine, Star, Heart, Circle, Square, Settings, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Rnd } from 'react-rnd';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { getPrinters, printImageToPrinter, printRawEscPos, connectQZ } from '../services/qzService';
import { labelConfigService } from '../services/labelConfigService';

// --- Types for Draggable Elements ---
type ElementType = 'text' | 'qr' | 'icon';

interface DraggableElement {
  id: string;
  type: ElementType;
  content: string;
  x: number;
  y: number;
  width: number | string;
  height: number | string;
  style?: React.CSSProperties;
  scale?: number;
  color?: string;
}

interface LabelTemplate {
  id: string;
  name: string;
  elements: DraggableElement[];
}

// --- Text Formatting Toolbar Component ---
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

const TextFormattingToolbar = ({ onExec }: { onExec: (command: string, arg?: string) => void }) => {
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onExec('foreColor', e.target.value);
  };

  const handleBgColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onExec('backColor', e.target.value);
  };

  return (
    <div className="p-2 flex flex-wrap gap-1 items-center">
      <button onMouseDown={(e) => { e.preventDefault(); onExec('undo'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Deshacer"><Undo className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('redo'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Rehacer"><Redo className="w-4 h-4" /></button>
      
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      <button onMouseDown={(e) => { e.preventDefault(); onExec('bold'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Negrita"><Bold className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('italic'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Cursiva"><Italic className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('underline'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Subrayado"><Underline className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('strikeThrough'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Tachado"><Strikethrough className="w-4 h-4" /></button>
      
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
      
      <select 
        onChange={(e) => onExec('customFontSize', e.target.value)} 
        defaultValue="12" 
        className="bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl p-1.5 transition-all"
      >
        {FONT_SIZES.map(size => (
          <option key={size} value={size}>{size}px</option>
        ))}
      </select>

      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      <select 
        onChange={(e) => onExec('fontName', e.target.value)} 
        defaultValue="Arial" 
        className="bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl p-1.5 transition-all w-24"
      >
        <option value="Arial">Arial</option>
        <option value="'Courier New'">Courier</option>
        <option value="'Times New Roman'">Times</option>
        <option value="Impact">Impact</option>
        <option value="'Comic Sans MS'">Comic Sans</option>
        <option value="Verdana">Verdana</option>
        <option value="Georgia">Georgia</option>
      </select>

      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      <div className="relative flex items-center group" title="Color de texto">
        <Palette className="w-4 h-4 text-slate-600 dark:text-slate-400 absolute left-2 pointer-events-none group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
        <input 
          type="color" 
          onChange={handleColorChange}
          className="w-8 h-8 opacity-0 cursor-pointer"
        />
      </div>

      <div className="relative flex items-center group" title="Color de resaltado">
        <Highlighter className="w-4 h-4 text-slate-600 dark:text-slate-400 absolute left-2 pointer-events-none group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
        <input 
          type="color" 
          onChange={handleBgColorChange}
          defaultValue="#ffff00"
          className="w-8 h-8 opacity-0 cursor-pointer"
        />
      </div>

      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      <button onMouseDown={(e) => { e.preventDefault(); onExec('justifyLeft'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Alinear Izquierda"><AlignLeft className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('justifyCenter'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Centrar"><AlignCenter className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('justifyRight'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Alinear Derecha"><AlignRight className="w-4 h-4" /></button>

      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      <button onMouseDown={(e) => { e.preventDefault(); onExec('insertUnorderedList'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Lista con viñetas"><List className="w-4 h-4" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); onExec('insertOrderedList'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Lista numerada"><ListOrdered className="w-4 h-4" /></button>
      
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
      
      <button onMouseDown={(e) => { e.preventDefault(); onExec('removeFormat'); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-white" title="Borrar formato"><Eraser className="w-4 h-4" /></button>
    </div>
  );
};

// --- InlineTextEditor Component ---
const InlineTextEditor = ({ 
  initialValue, 
  isEditing, 
  onChange, 
  onBlur 
}: { 
  initialValue: string, 
  isEditing: boolean, 
  onChange: (val: string) => void, 
  onBlur: (e: React.FocusEvent) => void 
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSentHtml = useRef(initialValue);
  const hasInitialized = useRef(false);

  // Sync from props to DOM (only when not focused)
  useEffect(() => {
    const isFocused = document.activeElement === editorRef.current;
    if (editorRef.current && !isFocused && initialValue !== lastSentHtml.current) {
      editorRef.current.innerHTML = initialValue;
      lastSentHtml.current = initialValue;
    }
  }, [initialValue]);

  // Initial content set
  useEffect(() => {
    if (editorRef.current && !hasInitialized.current) {
      editorRef.current.innerHTML = initialValue;
      hasInitialized.current = true;
      lastSentHtml.current = initialValue;
    }
  }, []);

  useEffect(() => {
    if (isEditing && editorRef.current) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.focus({ preventScroll: true });
        
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [isEditing]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    // Only update if content actually changed to avoid unnecessary re-renders
    if (html !== lastSentHtml.current) {
      lastSentHtml.current = html;
      onChange(html);
    }
  };

  return (
    <div 
      ref={editorRef}
      className={`rich-text-content w-full min-h-[1em] ${isEditing ? 'cancel-drag cursor-text outline-none ring-2 ring-blue-400/50' : ''}`}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={onBlur}
      onMouseDown={(e) => {
        if (isEditing) {
          e.stopPropagation();
        }
      }}
    />
  );
};
// ------------------------------------

interface LabelPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Constants for label size (50mm x 30mm)
const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 30;
// Minimum resolution (6 dots/mm)
// This creates the "lightest" possible image to avoid any printer processing issues.
const MM_TO_PX = 6;
const CANVAS_WIDTH = LABEL_WIDTH_MM * MM_TO_PX;
const CANVAS_HEIGHT = LABEL_HEIGHT_MM * MM_TO_PX;

// Target dimensions for printing (matching physical label size)
const TARGET_PRINT_WIDTH_MM = LABEL_WIDTH_MM;
const TARGET_PRINT_HEIGHT_MM = LABEL_HEIGHT_MM;

const renderIcon = (name: string, color: string = '#000000') => {
  const props = { style: { width: '100%', height: '100%', color: color }, fill: "currentColor", strokeWidth: 1 };
  switch (name) {
    case 'star': return <Star {...props} />;
    case 'heart': return <Heart {...props} />;
    case 'circle': return <Circle {...props} />;
    case 'square': return <Square {...props} />;
    default: return <Star {...props} />;
  }
};

const ScaledTextElement = ({ el, isEditing, updateElement, setEditingElementId }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = el.scale || 1;

  useEffect(() => {
    if (!containerRef.current || isEditing) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const unscaledHeight = entry.contentRect.height;
        const scaledHeight = unscaledHeight * scale;
        const currentHeight = typeof el.height === 'number' ? el.height : parseFloat(el.height as string);
        
        if (isNaN(currentHeight) || Math.abs(currentHeight - scaledHeight) > 2) {
          setTimeout(() => {
            updateElement(el.id, { height: scaledHeight });
          }, 0);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [scale, el.height, el.id, updateElement]);

  return (
    <div 
      className={`w-full h-full ${isEditing ? 'overflow-visible' : 'overflow-hidden'}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditingElementId(el.id);
      }}
      onMouseDown={(e) => {
        if (isEditing) {
          e.stopPropagation();
        }
      }}
    >
      <div 
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${100 / scale}%`,
          height: 'auto',
          minHeight: '100%'
        }}
      >
        <div ref={containerRef} className="w-full">
          <InlineTextEditor
            initialValue={el.content}
            isEditing={isEditing}
            onChange={(val) => updateElement(el.id, { content: val })}
            onBlur={(e) => {
              // Check if the new focus is inside the toolbar
              const toolbar = document.querySelector('.text-toolbar-container');
              if (toolbar && toolbar.contains(e.relatedTarget as Node)) {
                // Keep editing if we clicked the toolbar
                return;
              }
              // If the related target is null, it might be a native dialog like the color picker.
              // We do NOT want to close the editor in this specific case, 
              // otherwise clicking colors kicks them out of edit mode.
              if (!e.relatedTarget) {
                return;
              }
              setEditingElementId(null);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const LabelPrinterModal: React.FC<LabelPrinterModalProps> = ({ isOpen, onClose }) => {
  const [elements, setElements] = useState<DraggableElement[]>([
    { id: 'text-1', type: 'text', content: 'Texto de ejemplo', x: 13, y: 13, width: 195, height: 'auto' }
  ]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>('text-1');
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const resizeStartData = useRef<{ [id: string]: { width: number, scale: number } }>({});
  const [printSettings, setPrintSettings] = useState({
    offsetX: 0,
    offsetY: 0,
    scale: 1.0
  });
  
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);
  
  const [savedConfigs, setSavedConfigs] = useState<any[]>([]);
  const [selectedConfigName, setSelectedConfigName] = useState<string>('default');

  const selectedElement = elements.find(el => el.id === selectedElementId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if we are editing text (unless it's a specific shortcut)
      if (editingElementId) return;
      
      // Don't trigger if focus is in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (selectedElementId) {
        const step = e.shiftKey ? 5 : 1;
        const elWidth = typeof selectedElement?.width === 'number' ? selectedElement.width : parseFloat(selectedElement?.width as string || '20');
        const elHeight = typeof selectedElement?.height === 'number' ? selectedElement.height : parseFloat(selectedElement?.height as string || '20');

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          updateElement(selectedElementId, { y: Math.max(0, (selectedElement?.y || 0) - step) });
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          updateElement(selectedElementId, { y: Math.min(CANVAS_HEIGHT - elHeight, (selectedElement?.y || 0) + step) });
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          updateElement(selectedElementId, { x: Math.max(0, (selectedElement?.x || 0) - step) });
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          updateElement(selectedElementId, { x: Math.min(CANVAS_WIDTH - elWidth, (selectedElement?.x || 0) + step) });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          setElements(prev => prev.filter(el => el.id !== selectedElementId));
          setSelectedElementId(null);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
          e.preventDefault();
          setElements(prev => {
            const el = prev.find(e => e.id === selectedElementId);
            if (el) {
              const newId = `${el.type}-${Date.now()}`;
              setSelectedElementId(newId);
              return [...prev, { ...el, id: newId, x: (el.x as number) + 10, y: (el.y as number) + 10 }];
            }
            return prev;
          });
        } else if ((e.ctrlKey || e.metaKey) && e.key === ']') {
          e.preventDefault();
          setElements(prev => {
            const el = prev.find(e => e.id === selectedElementId);
            if (!el) return prev;
            const others = prev.filter(e => e.id !== selectedElementId);
            return [...others, el];
          });
        } else if ((e.ctrlKey || e.metaKey) && e.key === '[') {
          e.preventDefault();
          setElements(prev => {
            const el = prev.find(e => e.id === selectedElementId);
            if (!el) return prev;
            const others = prev.filter(e => e.id !== selectedElementId);
            return [el, ...others];
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, editingElementId]);

  // Load print settings and printers
  useEffect(() => {
    labelConfigService.getAllConfigs().then(configs => {
      setSavedConfigs(configs);
      const defaultConfig = configs.find(c => c.name === 'default');
      if (defaultConfig) {
        setPrintSettings({
          offsetX: defaultConfig.offset_x,
          offsetY: defaultConfig.offset_y,
          scale: defaultConfig.scale
        });
      } else {
        const saved = localStorage.getItem('labelPrintSettings');
        if (saved) {
          try {
            setPrintSettings(JSON.parse(saved));
          } catch (e) {}
        }
      }
    });

    const savedPrinter = localStorage.getItem('labelPrinterName');
    if (savedPrinter) setSelectedPrinter(savedPrinter);

    getPrinters().then(list => {
      const uniqueList = Array.from(new Set(list));
      setPrinters(uniqueList);
      if (!savedPrinter && uniqueList.length > 0) {
        setSelectedPrinter(uniqueList[0]);
      } else if (savedPrinter && !uniqueList.includes(savedPrinter)) {
        // Keep the saved printer even if disconnected so the user knows
        setSelectedPrinter(savedPrinter);
      }
    }).catch((err: any) => {
      let errMsg = "";
      if (typeof err === 'string') errMsg = err;
      else if (err instanceof Error) errMsg = err.message;
      else if (err && err.message) errMsg = err.message;
      else errMsg = JSON.stringify(err);

      if (errMsg.includes('Connection attempt cancelled by user') || String(err).includes('Connection attempt cancelled by user')) {
        return; // Ignore user cancellation
      }
      // Filter out typical timeouts as warnings so they don't look like crashes
      if (errMsg.includes('QZ_TRAY_TIMEOUT') || errMsg.includes('QZ_TRAY_NOT_RUNNING')) {
         console.warn("QZ Tray not detected (expected if not installed).");
      } else {
         console.warn("QZ Tray connection error:", err);
      }
      
      if (errMsg.includes('Request blocked')) {
        toast.error("QZ Tray bloqueó la conexión. Haz clic en el icono verde de QZ Tray y permite el acceso a esta página.", { duration: 8000 });
      } else if (errMsg.includes('Connection closed before response')) {
        toast.error("La conexión con QZ Tray se interrumpió. Asegúrate de que la aplicación esté abierta y recarga la página.", { duration: 6000 });
      }
    });
  }, []);

  const handlePrinterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPrinter(val);
    localStorage.setItem('labelPrinterName', val);
  };

  // Save print settings
  const updatePrintSettings = (updates: Partial<typeof printSettings>) => {
    const newSettings = { ...printSettings, ...updates };
    setPrintSettings(newSettings);
  };

  const handleSaveCurrentConfig = async () => {
    await labelConfigService.saveConfig({
      name: selectedConfigName,
      offset_x: printSettings.offsetX,
      offset_y: printSettings.offsetY,
      scale: printSettings.scale
    });
    localStorage.setItem('labelPrintSettings', JSON.stringify(printSettings));
    const configs = await labelConfigService.getAllConfigs();
    setSavedConfigs(configs);
    toast.success('Configuración guardada');
  };

  const handleSaveConfigAs = async () => {
    const name = prompt('Nombre para esta configuración de impresión:', selectedConfigName);
    if (!name) return;
    
    await labelConfigService.saveConfig({
      name,
      offset_x: printSettings.offsetX,
      offset_y: printSettings.offsetY,
      scale: printSettings.scale
    });
    
    setSelectedConfigName(name);
    const configs = await labelConfigService.getAllConfigs();
    setSavedConfigs(configs);
    toast.success('Configuración guardada');
  };

  const handleLoadConfig = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedConfigName(name);
    const config = savedConfigs.find(c => c.name === name);
    if (config) {
      setPrintSettings({
        offsetX: config.offset_x,
        offsetY: config.offset_y,
        scale: config.scale
      });
      localStorage.setItem('labelPrintSettings', JSON.stringify({
        offsetX: config.offset_x,
        offsetY: config.offset_y,
        scale: config.scale
      }));
    }
  };

  const [templates, setTemplates] = useState<LabelTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('labelTemplates');
      const parsed = saved ? JSON.parse(saved) : [];
      if (parsed.length > 0) {
        // Deduplicate by ID
        const unique = new Map<string, LabelTemplate>();
        for (const t of parsed) {
          if (!unique.has(t.id)) unique.set(t.id, t);
        }
        return Array.from(unique.values());
      }
      return [
        {
          id: 'default',
          name: 'Estándar',
          elements: [
            { id: '1', type: 'text', content: '<div style="text-align: center;"><span style="font-size: 14px; font-weight: bold;">PRODUCTO</span></div>', x: 10, y: 10, width: 180, height: 30 },
            { id: '2', type: 'qr', content: 'https://ejemplo.com', x: 70, y: 45, width: 60, height: 60 },
            { id: '3', type: 'text', content: '<div style="text-align: center;"><span style="font-size: 10px;">SKU: 12345</span></div>', x: 10, y: 110, width: 180, height: 20 },
          ]
        }
      ];
    } catch (e) {
      return [];
    }
  });
  
  const printRef = useRef<HTMLDivElement>(null);

  const saveTemplate = () => {
    const name = prompt('Nombre de la plantilla:');
    if (!name) return;
    const newTemplate: LabelTemplate = { id: Date.now().toString(), name, elements };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    localStorage.setItem('labelTemplates', JSON.stringify(updated));
    toast.success('Plantilla guardada correctamente');
  };

  const loadTemplate = (template: LabelTemplate) => {
    try {
      if (!template || !Array.isArray(template.elements)) {
        throw new Error("Formato de plantilla inválido");
      }
      setElements(template.elements);
      setSelectedElementId(null);
      toast.success(`Plantilla "${template.name}" cargada`);
    } catch (error) {
      console.warn("Error loading template:", error);
      toast.error("No se pudo cargar la plantilla");
    }
  };

  const deleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta plantilla?')) return;
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem('labelTemplates', JSON.stringify(updated));
    toast.success('Plantilla eliminada');
  };

  if (!isOpen) return null;

  const handleAddText = () => {
    const newId = `text-${Date.now()}`;
    setElements(prev => [...prev, { id: newId, type: 'text', content: 'Nuevo texto', x: 20, y: 20, width: 150, height: 'auto' }]);
    setSelectedElementId(newId);
  };

  const handleAddQr = () => {
    const newId = `qr-${Date.now()}`;
    setElements(prev => [...prev, { id: newId, type: 'qr', content: 'https://example.com', x: 50, y: 20, width: 60, height: 60 }]);
    setSelectedElementId(newId);
  };

  const handleAddIcon = (iconName: string) => {
    const newId = `icon-${Date.now()}`;
    setElements(prev => [...prev, { id: newId, type: 'icon', content: iconName, x: 30, y: 30, width: 40, height: 40 }]);
    setSelectedElementId(newId);
  };

  const handleDuplicate = () => {
    if (!selectedElement) return;
    const newId = `${selectedElement.type}-${Date.now()}`;
    setElements(prev => {
      const el = prev.find(e => e.id === selectedElementId);
      if (!el) return prev;
      return [...prev, { ...el, id: newId, x: (el.x as number) + 10, y: (el.y as number) + 10 }];
    });
    setSelectedElementId(newId);
    toast.success('Elemento duplicado');
  };

  const handleBringToFront = () => {
    if (!selectedElementId) return;
    setElements(prev => {
      const el = prev.find(e => e.id === selectedElementId);
      if (!el) return prev;
      const others = prev.filter(e => e.id !== selectedElementId);
      return [...others, el];
    });
  };

  const handleSendToBack = () => {
    if (!selectedElementId) return;
    setElements(prev => {
      const el = prev.find(e => e.id === selectedElementId);
      if (!el) return prev;
      const others = prev.filter(e => e.id !== selectedElementId);
      return [el, ...others];
    });
  };

  function updateElement(id: string, updates: Partial<DraggableElement>) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }

  function handleDeleteElement(id: string) {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
  }

  function handleClearDesign() {
    if (confirm('¿Estás seguro de que quieres borrar todo el diseño?')) {
      setElements([]);
      setSelectedElementId(null);
      toast.success('Diseño limpiado');
    }
  }

  function handleCenterVertical() {
    if (!selectedElementId || !selectedElement) return;
    let height = typeof selectedElement.height === 'number' ? selectedElement.height : parseFloat(selectedElement.height as string);
    if (isNaN(height)) {
      const node = document.getElementById(`element-${selectedElementId}`);
      if (node) height = node.offsetHeight;
      else return;
    }
    updateElement(selectedElementId, { y: (CANVAS_HEIGHT - height) / 2 });
  }

  function handleCenterHorizontal() {
    if (!selectedElementId || !selectedElement) return;
    let width = typeof selectedElement.width === 'number' ? selectedElement.width : parseFloat(selectedElement.width as string);
    if (isNaN(width)) {
      const node = document.getElementById(`element-${selectedElementId}`);
      if (node) width = node.offsetWidth;
      else return;
    }
    updateElement(selectedElementId, { x: (CANVAS_WIDTH - width) / 2 });
  }

  const handlePrint = async () => {
    if (!printRef.current) return;
    
    if (!selectedPrinter) {
      toast.error("Por favor, selecciona una impresora primero.");
      return;
    }

    setIsPrinting(true);
    const toastId = toast.loading("1/3: Iniciando...");

    try {
      toast.loading("2/3: Generando imagen mínima...", { id: toastId });
      
      // Calculate exact scale to match 203 DPI printer resolution (8 dots per mm)
      // This prevents QZ Tray from downscaling the image with nearest-neighbor, 
      // which drops pixels and causes severe distortion/unreadable text.
      const targetDotsWidth = TARGET_PRINT_WIDTH_MM * 8; 
      const exactScale = targetDotsWidth / CANVAS_WIDTH;

      const canvas = await html2canvas(printRef.current, {
        scale: exactScale, 
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
      });

      // JPEG 0.8 for maximum compatibility
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      toast.loading("3/3: Enviando a la impresora...", { id: toastId });
      
      await printImageToPrinter(selectedPrinter, dataUrl, {
        width: TARGET_PRINT_WIDTH_MM,
        height: TARGET_PRINT_HEIGHT_MM
      });

      toast.success("¡Impresión enviada!", { id: toastId });
    } catch (error: any) {
      console.warn("Error printing:", error);
      const errMsg = error?.message || String(error);
      
      if (errMsg.includes('Request blocked')) {
        toast.error("Impresión bloqueada. Ve a QZ Tray > Advanced > Site Manager y permite esta página web (*.run.app).", { id: toastId, duration: 8000 });
      } else if (errMsg.includes('Connection closed before response')) {
        toast.error("Conexión interrumpida. Reinicia QZ Tray en tu computadora y vuelve a intentarlo.", { id: toastId, duration: 6000 });
      } else {
        toast.error("Error al imprimir. Asegúrate de que QZ Tray esté abierto.", { id: toastId });
      }
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <style>{`
        /* Rich Text Mappings for Preview */
        .rich-text-content font[size="1"] { font-size: 8px; line-height: 1.2; }
        .rich-text-content font[size="2"] { font-size: 10px; line-height: 1.2; }
        .rich-text-content font[size="3"] { font-size: 12px; line-height: 1.2; }
        .rich-text-content font[size="4"] { font-size: 14px; line-height: 1.1; }
        .rich-text-content font[size="5"] { font-size: 18px; line-height: 1.1; }
        .rich-text-content font[size="6"] { font-size: 24px; line-height: 1; }
        .rich-text-content font[size="7"] { font-size: 32px; line-height: 1; }
        .rich-text-content ul { padding-left: 15px; margin: 2px 0; list-style-type: disc; }
        .rich-text-content ol { padding-left: 15px; margin: 2px 0; list-style-type: decimal; }
        
        .rnd-element:hover {
          outline: 1px dashed #3b82f6;
        }
        .rnd-element.selected {
          outline: 2px solid #3b82f6;
        }

        .rnd-element:not(.selected) .custom-resize-handle {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        .custom-resize-handle {
          width: 12px !important;
          height: 12px !important;
          background-color: white !important;
          border: 2px solid #3b82f6 !important;
          border-radius: 50% !important;
          z-index: 20 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .custom-resize-handle-top {
          top: -6px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
        }
        .custom-resize-handle-right {
          right: -6px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        .custom-resize-handle-bottom {
          bottom: -6px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
        }
        .custom-resize-handle-left {
          left: -6px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        .custom-resize-handle-topRight {
          top: -6px !important;
          right: -6px !important;
        }
        .custom-resize-handle-bottomRight {
          bottom: -6px !important;
          right: -6px !important;
        }
        .custom-resize-handle-bottomLeft {
          bottom: -6px !important;
          left: -6px !important;
        }
        .custom-resize-handle-topLeft {
          top: -6px !important;
          left: -6px !important;
        }
      `}</style>
      
      <div className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden border border-white/20 dark:border-white/10 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="bg-white/50 dark:bg-slate-950/50 backdrop-blur-md p-5 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center shrink-0">
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 tracking-tight">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20">
              <Printer className="w-6 h-6" />
            </div>
            Diseñador de Etiquetas
            <span className="text-sm font-medium text-slate-500 bg-slate-200/50 dark:bg-slate-800/50 px-3 py-1 rounded-full ml-2">50x30mm</span>
          </h2>
          <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-white dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl transition-all shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Workspace */}
        <div className="flex flex-1 overflow-hidden flex-col">
          
          {/* Templates Bar */}
          {templates.length > 0 && (
            <div className="h-28 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-4 overflow-x-auto shrink-0">
              {templates.map(t => (
                <div 
                  key={t.id} 
                  className="relative group cursor-pointer border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-lg overflow-hidden shrink-0 bg-white dark:bg-slate-800 transition-colors" 
                  onClick={() => loadTemplate(t)}
                  title={`Cargar plantilla: ${t.name}`}
                >
                  {/* Mini Preview */}
                  <div style={{ width: CANVAS_WIDTH * 0.4, height: CANVAS_HEIGHT * 0.4, position: 'relative', overflow: 'hidden', backgroundColor: 'white' }}>
                    <div style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: CANVAS_WIDTH, height: CANVAS_HEIGHT, pointerEvents: 'none' }}>
                      {t.elements.map(el => (
                        <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height }}>
                          {el.type === 'text' ? (
                            <div 
                              className="w-full h-full overflow-hidden"
                            >
                              <div 
                                style={{
                                  transform: `scale(${el.scale || 1})`,
                                  transformOrigin: 'top left',
                                  width: `calc(100% / ${el.scale || 1})`,
                                  height: 'max-content',
                                }}
                              >
                                <div className="rich-text-content w-full" dangerouslySetInnerHTML={{ __html: el.content }} />
                              </div>
                            </div>
                          ) : el.type === 'qr' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <QRCodeSVG value={el.content || 'empty'} size={Math.min(parseInt(el.width as string) || 60, parseInt(el.height as string) || 60)} level="M" includeMargin={false} style={{ width: '100%', height: '100%' }} />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {renderIcon(el.content)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-white text-[10px] px-2 py-1 truncate font-medium text-center">
                    {t.name}
                  </div>
                  <button 
                    onClick={(e) => deleteTemplate(t.id, e)} 
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    title="Eliminar plantilla"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            {/* Left Toolbar - Tools */}
            <div className="w-20 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col items-center py-6 gap-5 shrink-0 overflow-y-auto custom-scrollbar">
              <button 
                onClick={handleAddText}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Texto"
              >
                <Type className="w-6 h-6" />
              </button>
              <button 
                onClick={handleAddQr}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Código QR"
              >
                <QrCodeIcon className="w-6 h-6" />
              </button>
              <div className="w-10 h-px bg-slate-200 dark:bg-slate-700 shrink-0 my-2" />
              <button 
                onClick={() => handleAddIcon('star')}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Estrella"
              >
                <Star className="w-6 h-6" />
              </button>
              <button 
                onClick={() => handleAddIcon('heart')}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Corazón"
              >
                <Heart className="w-6 h-6" />
              </button>
              <button 
                onClick={() => handleAddIcon('circle')}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Círculo"
              >
                <Circle className="w-6 h-6" />
              </button>
              <button 
                onClick={() => handleAddIcon('square')}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-blue-400 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                title="Añadir Cuadrado"
              >
                <Square className="w-6 h-6" />
              </button>
            </div>

            {/* Center - Canvas */}
            <div 
              className="flex-1 bg-slate-100/50 dark:bg-slate-900/50 overflow-auto flex flex-col items-center justify-center p-8 relative"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.rnd-element') || (e.target as HTMLElement).closest('.z-20')) return;
                setSelectedElementId(null);
                setEditingElementId(null);
              }}
            >
              
              {/* Floating Toolbar for Text */}
              {editingElementId && elements.find(e => e.id === editingElementId)?.type === 'text' && (
                <div 
                  className="text-toolbar-container absolute top-4 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden animate-in slide-in-from-top-4 duration-200"
                >
                  <TextFormattingToolbar onExec={(cmd, arg) => {
                    // Ensure editor is focused before executing command
                    const editor = document.querySelector('.rich-text-content[contenteditable="true"]') as HTMLElement;
                    if (editor) editor.focus();

                    if (cmd === 'customFontSize') {
                      document.execCommand('fontSize', false, '7');
                      const fonts = document.querySelectorAll('font[size="7"]');
                      fonts.forEach(f => {
                        f.removeAttribute('size');
                        (f as HTMLElement).style.fontSize = `${arg}px`;
                      });
                      
                      // Force update the state
                      if (editor) {
                        updateElement(editingElementId, { content: editor.innerHTML });
                      }
                    } else {
                      document.execCommand(cmd, false, arg);
                      // Force update the state for other commands too
                      if (editor) {
                        updateElement(editingElementId, { content: editor.innerHTML });
                      }
                    }
                  }} />
                </div>
              )}

              {/* The Canvas (Scaled up for editing) */}
              <div className="flex flex-col items-center mt-12">
                <div 
                  className="bg-white shadow-xl relative"
                  style={{ 
                    width: CANVAS_WIDTH, 
                    height: CANVAS_HEIGHT,
                    transform: 'scale(1.5)',
                    transformOrigin: 'center'
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                      setSelectedElementId(null);
                    }
                  }}
                >
                  {/* Safe Area Indicator */}
                  <div 
                    className="absolute pointer-events-none border border-red-400/40 border-dashed z-0"
                    style={{
                      top: 2 * MM_TO_PX, 
                      left: 2 * MM_TO_PX, 
                      right: 2 * MM_TO_PX, 
                      bottom: 2 * MM_TO_PX,
                      borderRadius: '4px'
                    }}
                  />

                  {elements.map((el, index) => (
                    <Rnd
                      id={`element-${el.id}`}
                      key={el.id}
                      style={{ zIndex: index + 10 }}
                      scale={1.5}
                      size={{ width: el.width, height: el.height }}
                      position={{ x: el.x as number, y: el.y as number }}
                      disableDragging={editingElementId === el.id}
                      bounds="parent"
                      onDragStop={(e, d) => {
                        updateElement(el.id, { x: d.x, y: d.y });
                      }}
                      onResizeStart={(e, dir, ref) => {
                        resizeStartData.current[el.id] = {
                          width: ref.offsetWidth,
                          scale: el.scale || 1
                        };
                      }}
                      onResize={(e, direction, ref, delta, position) => {
                        const startData = resizeStartData.current[el.id];
                        if (!startData) return;
                        
                        let newScale = el.scale || 1;
                        const isCorner = direction.length > 5;
                        if (isCorner && el.type === 'text') {
                          newScale = startData.scale * (ref.offsetWidth / startData.width);
                        }
                        
                        updateElement(el.id, {
                          width: ref.style.width,
                          height: el.type === 'text' ? el.height : ref.style.height,
                          scale: newScale,
                          ...position,
                        });
                      }}
                      onResizeStop={(e, direction, ref, delta, position) => {
                        const startData = resizeStartData.current[el.id];
                        let newScale = el.scale || 1;
                        const isCorner = direction.length > 5;
                        if (isCorner && el.type === 'text' && startData) {
                          newScale = startData.scale * (ref.offsetWidth / startData.width);
                        }
                        updateElement(el.id, {
                          width: ref.style.width,
                          height: el.type === 'text' ? el.height : ref.style.height,
                          scale: newScale,
                          ...position,
                        });
                      }}
                      enableResizing={el.type === 'text' ? {
                        top: false, right: true, bottom: false, left: true,
                        topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
                      } : {
                        top: true, right: true, bottom: true, left: true,
                        topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
                      }}
                      cancel=".cancel-drag"
                      className={`rnd-element ${selectedElementId === el.id ? 'selected' : ''}`}
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setSelectedElementId(el.id);
                      }}
                      resizeHandleClasses={{
                        top: 'custom-resize-handle custom-resize-handle-top',
                        right: 'custom-resize-handle custom-resize-handle-right',
                        bottom: 'custom-resize-handle custom-resize-handle-bottom',
                        left: 'custom-resize-handle custom-resize-handle-left',
                        topRight: 'custom-resize-handle custom-resize-handle-topRight',
                        bottomRight: 'custom-resize-handle custom-resize-handle-bottomRight',
                        bottomLeft: 'custom-resize-handle custom-resize-handle-bottomLeft',
                        topLeft: 'custom-resize-handle custom-resize-handle-topLeft'
                      }}
                    >
                      <div className="w-full h-full relative group">
                        
                        {/* Duplicate Button */}
                        <button 
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const newId = `${el.type}-${Date.now()}`;
                            setElements([...elements, { ...el, id: newId, x: (el.x as number) + 10, y: (el.y as number) + 10 }]);
                            setSelectedElementId(newId);
                          }}
                          className={`absolute -top-3 right-2 w-4 h-4 bg-blue-500 hover:bg-blue-600 text-white rounded-sm items-center justify-center cursor-pointer z-10 shadow-sm ${selectedElementId === el.id ? 'flex' : 'hidden group-hover:flex'}`}
                          title="Duplicar elemento"
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>

                        {/* Delete Button */}
                        <button 
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); handleDeleteElement(el.id); }}
                          className={`absolute -top-3 -right-3 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-sm items-center justify-center cursor-pointer z-10 shadow-sm ${selectedElementId === el.id ? 'flex' : 'hidden group-hover:flex'}`}
                          title="Eliminar elemento"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>

                        {/* Content */}
                        <div 
                          className="w-full h-full overflow-hidden"
                          onDoubleClick={(e) => {
                            if (el.type === 'text') {
                              e.stopPropagation();
                              setEditingElementId(el.id);
                              setSelectedElementId(el.id);
                            }
                          }}
                        >
                          {el.type === 'text' ? (
                            <ScaledTextElement
                              el={el}
                              isEditing={editingElementId === el.id}
                              updateElement={updateElement}
                              setEditingElementId={setEditingElementId}
                            />
                          ) : el.type === 'qr' ? (
                            <div className="w-full h-full flex items-center justify-center bg-white">
                              <QRCodeSVG 
                                value={el.content || 'empty'} 
                                size={Math.min(
                                  typeof el.width === 'number' ? el.width : parseInt(String(el.width)) || 60, 
                                  typeof el.height === 'number' ? el.height : parseInt(String(el.height)) || 60
                                )} 
                                level="M" 
                                includeMargin={false} 
                                style={{ width: '100%', height: '100%' }} 
                              />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {renderIcon(el.content)}
                            </div>
                          )}
                        </div>
                      </div>
                    </Rnd>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar - Properties */}
          <div className="w-80 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md border-l border-slate-200/50 dark:border-slate-800/50 flex flex-col shrink-0">
            <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white text-lg tracking-tight">Propiedades</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              {selectedElement ? (
                <div className="space-y-4 flex flex-col mb-auto">
                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-4">
                    <button onClick={handleDuplicate} className="flex-1 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm border border-slate-200 dark:border-slate-700 hover:-translate-y-0.5" title="Duplicar">
                      <Copy className="w-3.5 h-3.5" /> Duplicar
                    </button>
                    <button onClick={handleBringToFront} className="flex-1 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm border border-slate-200 dark:border-slate-700 hover:-translate-y-0.5" title="Traer al frente">
                      <ArrowUpToLine className="w-3.5 h-3.5" /> Frente
                    </button>
                    <button onClick={handleSendToBack} className="flex-1 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm border border-slate-200 dark:border-slate-700 hover:-translate-y-0.5" title="Enviar al fondo">
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Fondo
                    </button>
                  </div>

                  {/* Alignment Tools */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      onClick={handleCenterHorizontal}
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-bold transition-all shadow-sm border border-slate-200 dark:border-slate-700 hover:-translate-y-0.5"
                      title="Centrar Horizontalmente"
                    >
                      <AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-blue-500" />
                      Centro H
                    </button>
                    <button
                      onClick={handleCenterVertical}
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-bold transition-all shadow-sm border border-slate-200 dark:border-slate-700 hover:-translate-y-0.5"
                      title="Centrar Verticalmente"
                    >
                      <AlignVerticalJustifyCenter className="w-3.5 h-3.5 text-blue-500" />
                      Centro V
                    </button>
                  </div>

                  {selectedElement.type === 'text' && (
                    <div className="flex flex-col">
                      <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                        <p className="text-sm text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                          Haz doble clic en el texto en el lienzo para editarlo y aplicar formato.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedElement.type === 'qr' && (
                    <div>
                      <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Contenido del QR</label>
                      <input
                        type="text"
                        value={selectedElement.content}
                        onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                        className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-shadow"
                        placeholder="https://..."
                      />
                    </div>
                  )}

                  {selectedElement.type === 'icon' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Icono</label>
                        <select
                          value={selectedElement.content}
                          onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                          className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-shadow"
                        >
                          <option value="star">Estrella</option>
                          <option value="heart">Corazón</option>
                          <option value="circle">Círculo</option>
                          <option value="square">Cuadrado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Color del Icono</label>
                        <div className="flex flex-wrap gap-2">
                          {['#000000', '#1e293b', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b'].map((c) => (
                            <button
                              key={c}
                              onClick={() => updateElement(selectedElement.id, { color: c })}
                              className={`w-6 h-6 rounded-full border-2 ${selectedElement.color === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 mb-auto">
                  <div className="h-40 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4">
                    Selecciona un elemento en el lienzo para editar sus propiedades.
                  </div>

                  <button
                    onClick={handleClearDesign}
                    className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-red-100 dark:border-red-900/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpiar Todo el Diseño
                  </button>

                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Calibración de Impresión</h4>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleSaveCurrentConfig}
                          className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-bold transition-colors"
                        >
                          Guardar
                        </button>
                        <button 
                          onClick={handleSaveConfigAs}
                          className="text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg font-bold transition-colors"
                        >
                          Guardar como...
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Configuración Activa</label>
                      <select 
                        value={selectedConfigName}
                        onChange={handleLoadConfig}
                        className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-shadow"
                      >
                        {savedConfigs.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                        {!savedConfigs.find(c => c.name === selectedConfigName) && (
                          <option key={selectedConfigName} value={selectedConfigName}>{selectedConfigName}</option>
                        )}
                      </select>
                    </div>
                    
                    <div className="space-y-4 pt-2">
                      <div>
                        <div className="flex justify-between text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                          <span>Desplazamiento X</span>
                          <span className="text-blue-600 dark:text-blue-400">{printSettings.offsetX}mm</span>
                        </div>
                        <input 
                          type="range" min="-10" max="10" step="0.5"
                          value={printSettings.offsetX}
                          onChange={(e) => updatePrintSettings({ offsetX: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                          <span>Desplazamiento Y</span>
                          <span className="text-blue-600 dark:text-blue-400">{printSettings.offsetY}mm</span>
                        </div>
                        <input 
                          type="range" min="-10" max="10" step="0.5"
                          value={printSettings.offsetY}
                          onChange={(e) => updatePrintSettings({ offsetY: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                          <span>Escala General</span>
                          <span className="text-blue-600 dark:text-blue-400">{(printSettings.scale * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                          type="range" min="0.5" max="1.5" step="0.05"
                          value={printSettings.scale}
                          onChange={(e) => updatePrintSettings({ scale: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                      
                      <p className="text-[10px] text-slate-400 italic leading-tight">
                        * Usa estos controles si la impresión sale movida o muy grande/pequeña en tu impresora.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* The Preview (Actual size) */}
              <div className="mt-8 flex flex-col items-center">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 w-full text-center">
                  Vista Previa (Tamaño Real)
                </label>
                <div 
                  className="relative border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 rounded-lg overflow-hidden"
                  style={{ 
                    width: CANVAS_WIDTH * 0.5, 
                    height: CANVAS_HEIGHT * 0.5,
                  }}
                >
                  <div 
                    className="bg-white shadow-sm relative pointer-events-none"
                    style={{ 
                      width: CANVAS_WIDTH, 
                      height: CANVAS_HEIGHT,
                      transform: 'scale(0.5)',
                      transformOrigin: 'top left'
                    }}
                  >
                    {/* Apply the same scale and offset as the print container */}
                    <div style={{
                      width: '100%',
                      height: '100%',
                      transform: `translate(${printSettings.offsetX * MM_TO_PX}px, ${printSettings.offsetY * MM_TO_PX}px) scale(${printSettings.scale})`,
                      transformOrigin: 'top left'
                    }}>
                      {elements.map(el => (
                        <div key={`preview-${el.id}`} style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height }}>
                          {el.type === 'text' ? (
                            <div 
                              className="w-full h-full overflow-hidden"
                            >
                              <div 
                                style={{
                                  transform: `scale(${el.scale || 1})`,
                                  transformOrigin: 'top left',
                                  width: `calc(100% / ${el.scale || 1})`,
                                  height: 'max-content',
                                }}
                              >
                                <div className="rich-text-content w-full" dangerouslySetInnerHTML={{ __html: el.content }} />
                              </div>
                            </div>
                          ) : el.type === 'qr' ? (
                            <div className="w-full h-full flex items-center justify-center bg-white">
                              <QRCodeSVG 
                                value={el.content || 'empty'} 
                                size={Math.min(
                                  typeof el.width === 'number' ? el.width : parseInt(el.width) || 60, 
                                  typeof el.height === 'number' ? el.height : parseInt(el.height) || 60
                                )} 
                                level="M" 
                                includeMargin={false} 
                                style={{ width: '100%', height: '100%' }} 
                              />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {renderIcon(el.content)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Print Button Area */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col gap-3">
              
              {/* Printer Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Settings className="w-3 h-3" /> Impresora de Etiquetas y Facturas
                </label>
                {printers.length > 0 ? (
                  <select 
                    value={selectedPrinter} 
                    onChange={handlePrinterChange}
                    className="w-full p-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {printers.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    {selectedPrinter && !printers.includes(selectedPrinter) && (
                      <option key={selectedPrinter} value={selectedPrinter}>{selectedPrinter} (Desconectada)</option>
                    )}
                  </select>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800/30">
                      QZ Tray no detectado. Abre QZ Tray para imprimir.
                    </div>
                    <button
                      onClick={() => {
                        toast.loading("Conectando a QZ Tray...", { id: 'qz-connect' });
                        getPrinters().then(list => {
                          setPrinters(list);
                          if (list.length > 0) {
                            setSelectedPrinter(list[0]);
                            toast.success("Conectado a QZ Tray", { id: 'qz-connect' });
                          } else {
                            toast.error("No se encontraron impresoras", { id: 'qz-connect' });
                          }
                        }).catch(err => {
                          const msg = err?.message || String(err);
                          if (msg.includes('QZ_TRAY_NOT_RUNNING') || msg.includes('QZ_TRAY_TIMEOUT')) {
                              toast.error("QZ Tray no está abierto o instalado.", { id: 'qz-connect' });
                          } else {
                              console.warn(err);
                              toast.error("Error al conectar con QZ Tray", { id: 'qz-connect' });
                          }
                        });
                      }}
                      className="text-xs w-full py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded transition-colors"
                    >
                      Reintentar Conexión
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={saveTemplate}
                disabled={elements.length === 0}
                className="w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-sm hover:shadow-md"
              >
                <Save className="w-4 h-4" />
                Guardar Plantilla
              </button>
              <button
                onClick={handlePrint}
                disabled={elements.length === 0 || isPrinting || printers.length === 0}
                className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl font-black shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
              >
                <Printer className="w-5 h-5" />
                {isPrinting ? 'Imprimiendo...' : 'Imprimir Etiqueta'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Hidden Print Container - Positioned off-screen for better capture compatibility */}
      <div className="fixed top-0 left-[-9999px] overflow-hidden" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <div 
          ref={printRef} 
          style={{ 
            width: CANVAS_WIDTH + 'px', 
            height: CANVAS_HEIGHT + 'px', 
            position: 'relative',
            backgroundColor: 'white',
            overflow: 'hidden'
          }}
        >
          {/* Internal wrapper for scaling and offset - this ensures the capture area remains fixed at label size */}
          <div style={{
            width: '100%',
            height: '100%',
            transform: `translate(${printSettings.offsetX * MM_TO_PX}px, ${printSettings.offsetY * MM_TO_PX}px) scale(${printSettings.scale})`,
            transformOrigin: 'top left'
          }}>
            {elements.map((el, index) => {
              const leftPx = el.x + 'px';
              const topPx = el.y + 'px';
              const widthPx = el.width === 'auto' ? 'auto' : (typeof el.width === 'number' ? el.width : parseFloat(el.width)) + 'px';
              const heightPx = el.height === 'auto' ? 'auto' : (typeof el.height === 'number' ? el.height : parseFloat(el.height)) + 'px';

              return (
                <div 
                  key={el.id} 
                  className="draggable-element"
                  style={{
                    left: leftPx,
                    top: topPx,
                    width: widthPx,
                    height: heightPx,
                    position: 'absolute',
                    zIndex: index + 10,
                    color: 'black',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {el.type === 'text' ? (
                    <div 
                      style={{
                        transform: `scale(${el.scale || 1})`,
                        transformOrigin: 'top left',
                        width: `calc(100% / ${el.scale || 1})`,
                        height: 'max-content',
                      }}
                    >
                      <div 
                        className="rich-text-content"
                        style={{ width: '100%', margin: 0, padding: 0, wordBreak: 'break-word', color: 'black' }}
                        dangerouslySetInnerHTML={{ __html: el.content }}
                      />
                    </div>
                  ) : el.type === 'qr' ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <QRCodeSVG value={el.content || 'empty'} size={256} level="M" includeMargin={false} style={{ width: '100%', height: '100%', color: 'black' }} />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {renderIcon(el.content, el.color)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
