
import { RepairOrder, OrderStatus, OrderType, Payment, InventoryPart, RequestStatus } from '../types';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

import { printHtmlToPrinter, printImageToPrinter, printRawEscPos } from './qzService';

const openPrintWindow = () => {
    const printWindow = window.open('about:blank', '_blank');
    if (!printWindow) {
        alert("Por favor permite ventanas emergentes para imprimir la factura.");
        return null;
    }
    printWindow.document.open();
    return printWindow;
};

const printHtmlAsImage = async (
  htmlContent: string, 
  printerName: string, 
  widthPx: number = 350, 
  printWidthMm: number = 80,
  heightPx?: number,
  printHeightMm?: number
) => {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = `${widthPx}px`;
    if (heightPx) iframe.style.height = `${heightPx}px`;
    iframe.style.zIndex = '-9999';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    
    document.body.appendChild(iframe);
    
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("Could not access iframe document");
    
    doc.open();
    doc.write(htmlContent);
    doc.close();
    
    // Apply label settings if it's a label (50mm width)
    if (printWidthMm === 50) {
      const savedSettings = localStorage.getItem('labelPrintSettings');
      let printSettings = { offsetX: 0, offsetY: 0, scale: 1.0 };
      if (savedSettings) {
        try { printSettings = JSON.parse(savedSettings); } catch(e) {}
      }
      doc.body.style.transform = `translate(${printSettings.offsetX}mm, ${printSettings.offsetY}mm) scale(${printSettings.scale})`;
      doc.body.style.transformOrigin = 'top left';
    }
    
    // Wait for images to load if there are any
    const images = Array.from(doc.images);
    if (images.length > 0) {
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // Resolve on error so we don't hang
        });
      }));
    } else {
       // Minimal wait for DOM to settle if no images
       await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    const height = heightPx || doc.body.scrollHeight || 800;
    
    const canvas = await html2canvas(doc.body, {
      scale: 1.5, // Reduced from 2 for faster generation
      backgroundColor: '#ffffff',
      width: widthPx,
      height: height,
      logging: false,
      useCORS: true
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }

    const printOptions: any = { width: printWidthMm };
    if (printHeightMm) printOptions.height = printHeightMm;

    await printImageToPrinter(printerName, dataUrl, printOptions);
    return true;
  } catch (e: any) {
    console.warn("Failed to print HTML as image:", e);
    const errMsg = e?.message || String(e);
    if (errMsg.includes('Request blocked')) {
      toast.error("Impresión bloqueada. Ve a QZ Tray > Advanced > Site Manager y permite esta página web.");
    } else if (errMsg.includes('Connection closed before response')) {
      toast.error("Conexión interrumpida. Reinicia QZ Tray en tu computadora y vuelve a intentarlo.");
    } else {
      toast.error("Error al imprimir. Asegúrate de que QZ Tray esté abierto.");
    }
    return false;
  }
};

export const getInventoryLabelRawCommands = (part: InventoryPart, language: 'ESCPOS' | 'TSPL' = 'ESCPOS'): string[] => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\x0A';
  
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleSize = GS + '!' + '\x11';
  const normalSize = GS + '!' + '\x00';
  const cut = GS + 'V' + '\x41' + '\x10';
  
  const sku = part.id.slice(0, 8).toUpperCase();
  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  const name = removeAccents(part.name.substring(0, 60));
  const price = `$${part.price.toFixed(2)}`;

  if (language === 'TSPL') {
    return [
      'SIZE 50 mm, 30 mm\r\n',
      'GAP 2 mm, 0 mm\r\n',
      'DIRECTION 1\r\n',
      'CLS\r\n',
      `TEXT 20,20,"4",0,1,1,"SKU: ${sku}"\r\n`,
      `TEXT 20,80,"3",0,1,1,"${name.substring(0, 25)}"\r\n`,
      `TEXT 20,120,"3",0,1,1,"${name.substring(25, 50)}"\r\n`,
      `TEXT 20,170,"4",0,1,1,"PRECIO: ${price}"\r\n`,
      'PRINT 1,1\r\n'
    ];
  }
  
  const cmds: string[] = [];
  cmds.push(init);
  cmds.push(center);
  cmds.push(LF);
  cmds.push(boldOn + doubleSize + "SKU: " + sku + normalSize + boldOff + LF);
  cmds.push(LF);
  
  if (name.length > 30) {
      cmds.push(boldOn + name.substring(0, 30) + boldOff + LF);
      cmds.push(boldOn + name.substring(30, 60) + boldOff + LF);
  } else {
      cmds.push(boldOn + name + boldOff + LF);
  }
  
  cmds.push(LF);
  cmds.push(boldOn + doubleSize + "PRECIO: " + price + normalSize + boldOff + LF);
  cmds.push(LF);
  cmds.push(LF);
  
  cmds.push(cut);
  return cmds;
};

export const printInventoryLabel = async (part: InventoryPart) => {
  const sku = part.id.slice(0, 8).toUpperCase();

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>REPUESTO ${sku}</title>
      <style>
        @page { margin: 0; size: 50mm 30mm; }
        body { 
            font-family: sans-serif; 
            margin: 0; 
            padding: 0; 
            width: 50mm; 
            height: 30mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            text-align: center;
            box-sizing: border-box;
            padding: 2mm;
        }
        * { font-weight: 900 !important; }
        .sku-box { 
            font-size: 12px; 
            border: 1px solid #000; 
            border-radius: 4px;
            padding: 2px 6px;
            margin-bottom: 4px;
            font-family: monospace;
        }
        .name { 
            font-size: 12px; 
            line-height: 1.2; 
            margin-bottom: 4px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .price { font-size: 16px; }
      </style>
    </head>
    <body>
      <div class="sku-box">SKU: ${sku}</div>
      <div class="name">${part.name}</div>
      <div class="price">$${part.price.toLocaleString()}</div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const savedPrinter = localStorage.getItem('labelPrinterName');

  if (savedPrinter) {
    await printHtmlAsImage(content, savedPrinter, 190, 50, 114, 30);
    return;
  }

  const printWindow = openPrintWindow();
  if (!printWindow) return;
  printWindow.document.write(content);
  printWindow.document.close();
};

export const getStickerRawCommands = (order: RepairOrder, language: 'ESCPOS' | 'TSPL' = 'ESCPOS'): string[] => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\x0A';
  
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const right = ESC + 'a' + '\x02';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleSize = GS + '!' + '\x11';
  const normalSize = GS + '!' + '\x00';
  const fontB = ESC + 'M' + '\x01';
  const fontA = ESC + 'M' + '\x00';
  const cut = GS + 'V' + '\x41' + '\x10';
  
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;
  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  
  let typeLabel = "CLIENTE";
  let infoLabel = "FALLA:";
  let infoValue = order.deviceIssue;
  let moneyLabel = "A COBRAR:";
  let moneyValue = `${(order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0)).toLocaleString()}`;

  if (order.orderType === OrderType.STORE) {
      typeLabel = "RECIBIDO";
      infoLabel = "ORIGEN:";
      infoValue = order.deviceSource || 'No especificado';
      moneyLabel = "COSTO:";
      moneyValue = `$${(order.purchaseCost || 0).toLocaleString()}`;
  } else if (order.orderType === OrderType.WARRANTY) {
      typeLabel = "GARANTIA";
      infoLabel = "FALLA:";
      infoValue = order.deviceIssue;
      moneyLabel = "INGRESO:";
      moneyValue = new Date(order.createdAt).toLocaleDateString();
  }

  const dateCreated = new Date(order.createdAt).toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  });
  
  const dateDeadline = order.deadline ? new Date(order.deadline).toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  }) : 'No def.';
  
  const deviceModelStr = removeAccents(order.deviceModel);
  const firstSpaceIdx = deviceModelStr.indexOf(' ');
  let deviceType = "";
  let deviceName = deviceModelStr;
  
  if (firstSpaceIdx > 0) {
      const firstWord = deviceModelStr.substring(0, firstSpaceIdx).toUpperCase();
      const knownTypes = ["CELULAR", "TABLET", "RELOJ", "LAPTOP", "CONSOLA", "SMARTWATCH", "AUDIFONOS", "BOCINA", "PC", "COMPUTADORA", "IPAD", "IPHONE", "MACBOOK"];
      if (knownTypes.includes(firstWord)) {
          deviceType = deviceModelStr.substring(0, firstSpaceIdx);
          deviceName = deviceModelStr.substring(firstSpaceIdx + 1);
      }
  }

  const padBetween = (leftStr: string, rightStr: string, totalLen: number) => {
      const spaces = totalLen - leftStr.length - rightStr.length;
      return leftStr + (spaces > 0 ? " ".repeat(spaces) : " ") + rightStr;
  };

  if (language === 'TSPL') {
    return [
      'SIZE 50 mm, 30 mm\r\n',
      'GAP 2 mm, 0 mm\r\n',
      'DIRECTION 1\r\n',
      'CLS\r\n',
      `TEXT 20,20,"4",0,1,1,"${typeLabel} ${displayId}"\r\n`,
      `TEXT 20,70,"3",0,1,1,"${deviceModelStr.substring(0, 25)}"\r\n`,
      `TEXT 20,110,"2",0,1,1,"${infoLabel} ${removeAccents(infoValue.substring(0, 30))}"\r\n`,
      `TEXT 20,150,"4",0,1,1,"${moneyLabel} ${moneyValue}"\r\n`,
      `TEXT 20,200,"2",0,1,1,"IN: ${dateCreated}"\r\n`,
      'PRINT 1,1\r\n'
    ];
  }

  const cmds: string[] = [];
  cmds.push(init);
  
  const headerStr = padBetween(typeLabel, displayId, 16);
  cmds.push(boldOn + doubleSize + headerStr + normalSize + boldOff + LF);
  cmds.push("--------------------------------" + LF);
  
  cmds.push(boldOn + deviceModelStr.substring(0, 32) + boldOff + LF);
  if (deviceModelStr.length > 32) {
      cmds.push(boldOn + deviceModelStr.substring(32, 64) + boldOff + LF);
  }
  
  cmds.push(fontB + infoLabel + " " + removeAccents(infoValue.substring(0, 40)) + fontA + LF);
  
  const moneyStr = `${moneyLabel} ${moneyValue}`;
  const boxLine = "-".repeat(moneyStr.length + 2);
  cmds.push(LF);
  cmds.push(boldOn + "+" + boxLine + "+" + LF);
  cmds.push("| " + moneyStr + " |" + LF);
  cmds.push("+" + boxLine + "+" + boldOff + LF);
  
  cmds.push(LF);
  const footerLeft = `IN: ${dateCreated}`;
  const footerRight = `ENT: ${dateDeadline}`;
  cmds.push(fontB + padBetween(footerLeft, footerRight, 42) + fontA + LF);
  
  cmds.push(cut);
  return cmds;
};

export const printSticker = async (order: RepairOrder, targetWindow?: Window | null) => {
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;

  // LOGIC FOR LABELS
  let typeLabel = "CLIENTE";
  let infoLabel = "FALLA:";
  let infoValue = order.deviceIssue;
  let moneyLabel = "A COBRAR:";
  let moneyValue = `${(order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0)).toLocaleString()}`;

  if (order.orderType === OrderType.STORE) {
      typeLabel = "RECIBIDO";
      infoLabel = "ORIGEN:";
      infoValue = order.deviceSource || 'No especificado';
      moneyLabel = "COSTO:";
      moneyValue = `$${(order.purchaseCost || 0).toLocaleString()}`;
  } else if (order.orderType === OrderType.WARRANTY) {
      typeLabel = "GARANTÍA";
      infoLabel = "FALLA:";
      infoValue = order.deviceIssue;
      moneyLabel = "INGRESO:";
      // For warranty, show date of entry as main info instead of cost
      moneyValue = new Date(order.createdAt).toLocaleDateString();
  }

  const dateCreated = new Date(order.createdAt).toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  });
  
  const dateDeadline = new Date(order.deadline).toLocaleString('es-ES', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  });

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>STICKER ${displayId}</title>
      <style>
        @page { margin: 0; size: 50mm 30mm; }
        body { 
            font-family: sans-serif; 
            margin: 0; 
            padding: 0; 
            width: 50mm; 
            height: 30mm; 
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center; /* Center the compact block vertically */
            box-sizing: border-box;
            padding: 0 2mm;
        }
        * { font-weight: 900 !important; line-height: 1; }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 0px; 
            margin-bottom: 0px; 
            flex-shrink: 0;
        }
        .type-badge {
            font-size: 10px;
            font-weight: normal !important; /* Letras normales */
            color: #000; /* Letras negras */
            padding: 0;
            background: transparent; /* Sin fondo */
            text-transform: uppercase;
        }
        .id-box { font-size: 13px; letter-spacing: -1px; }

        .main-row {
            display: flex;
            gap: 2px;
            align-items: center;
            padding: 1px 0; /* Minimal padding */
            margin: 0; /* No margin */
        }
        .info-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 0px; /* TIGHTER GAP */
        }
        .model { 
            font-size: 9px;
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            max-width: 28mm; 
            margin-bottom: 1px;
        }
        .issue { 
            font-size: 7px;
            overflow: hidden; 
            max-height: 8mm;
            line-height: 1; 
            margin-bottom: 1px;
        }
        .money { 
            font-size: 10px;
            border: 2px solid #000; 
            width: fit-content; 
            padding: 0px 2px;
            margin-top: 0px; /* No top margin */
        }

        .footer {
            margin-top: 0px; /* REMOVED MARGIN */
            border-top: 1px solid #000;
            padding-top: 0px; /* REMOVED PADDING */
            display: flex;
            justify-content: space-between;
            font-size: 6px;
            flex-shrink: 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <span class="type-badge">${typeLabel}</span>
        <span class="id-box">${displayId}</span>
      </div>

      <div class="main-row">
        <div class="info-col">
            <span class="model">${order.deviceModel}</span>
            <div class="issue">
                ${infoLabel} ${infoValue.substring(0, 60)}
            </div>
            <div class="money">
                ${moneyLabel} ${moneyValue}
            </div>
        </div>
      </div>

      <div class="footer">
        <span>IN: ${dateCreated}</span>
        <span>ENTREGA: ${dateDeadline}</span>
      </div>

      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const savedPrinter = localStorage.getItem('labelPrinterName');

  if (savedPrinter) {
    await printHtmlAsImage(content, savedPrinter, 190, 50, 114, 30);
    if (targetWindow) targetWindow.close();
    return;
  }

  const printWindow = targetWindow || openPrintWindow();
  if (!printWindow) return;
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
};

export const getTransferManifestRawCommands = (order: RepairOrder, fromBranch: string, toBranch: string): string[] => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\x0A';
  
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleSize = GS + '!' + '\x11';
  const normalSize = GS + '!' + '\x00';
  const cut = GS + 'V' + '\x41' + '\x10';
  
  const dateValue = new Date().toLocaleString('es-ES');
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;
  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  
  const cmds: string[] = [];
  cmds.push(init);
  cmds.push(center);
  cmds.push(boldOn + "DARWIN'S TALLER" + boldOff + LF);
  cmds.push("CONTROL DE TRASLADO INTERNO" + LF);
  cmds.push(dateValue + LF);
  cmds.push("--------------------------------" + LF);
  
  cmds.push(left);
  cmds.push("Orden ID: " + boldOn + doubleSize + displayId + normalSize + boldOff + LF);
  cmds.push("--------------------------------" + LF);
  cmds.push(center + "DE: " + removeAccents(fromBranch) + LF);
  cmds.push("V" + LF);
  cmds.push("PARA: " + removeAccents(toBranch) + LF);
  cmds.push(left + "--------------------------------" + LF);
  
  cmds.push(boldOn + "EQUIPO EN TRASLADO:" + boldOff + LF);
  const deviceModelStr = removeAccents(order.deviceModel);
  const firstSpaceIdx = deviceModelStr.indexOf(' ');
  let deviceType = "";
  let deviceName = deviceModelStr;
  
  if (firstSpaceIdx > 0) {
      const firstWord = deviceModelStr.substring(0, firstSpaceIdx).toUpperCase();
      const knownTypes = ["CELULAR", "TABLET", "RELOJ", "LAPTOP", "CONSOLA", "SMARTWATCH", "AUDIFONOS", "BOCINA", "PC", "COMPUTADORA", "IPAD", "IPHONE", "MACBOOK"];
      if (knownTypes.includes(firstWord)) {
          deviceType = deviceModelStr.substring(0, firstSpaceIdx);
          deviceName = deviceModelStr.substring(firstSpaceIdx + 1);
      }
  }

  if (deviceType) {
      cmds.push("- " + deviceType + " " + boldOn + deviceName + boldOff + LF);
  } else {
      cmds.push("- " + boldOn + deviceName + boldOff + LF);
  }
  if (order.imei) cmds.push("  IMEI: " + order.imei + LF);
  
  cmds.push(LF + "Nota / Falla:" + LF);
  cmds.push(removeAccents(order.deviceIssue.substring(0, 60)) + (order.deviceIssue.length > 60 ? '...' : '') + LF);
  
  cmds.push(LF + LF + LF);
  cmds.push(center + "__________________________" + LF);
  cmds.push("Despachado Por" + LF);
  cmds.push(LF + LF + LF);
  cmds.push(center + "__________________________" + LF);
  cmds.push("Recibido Por" + LF);
  
  cmds.push(LF + "Este documento certifica el" + LF + "movimiento de inventario" + LF + "entre sucursales." + LF);
  cmds.push(LF + LF + LF + cut);
  
  return cmds;
};

export const printTransferManifest = async (order: RepairOrder, fromBranch: string, toBranch: string) => {
  const dateValue = new Date().toLocaleString('es-ES');
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id}`;

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>TRASLADO ${displayId}</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { 
            font-family: 'Courier New', monospace; 
            margin: 0; 
            padding: 5px; 
            width: 72mm; 
            box-sizing: border-box;
            font-size: 11px; 
            color: #000;
        }
        * { font-weight: bold !important; }
        .center { text-align: center; }
        .header { margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 5px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .route-box { 
            border: 2px solid #000; 
            padding: 8px; 
            margin: 10px 0; 
            text-align: center; 
            font-size: 12px; 
            background: #f0f0f0;
        }
        .signatures { margin-top: 30px; display: flex; justify-content: space-between; gap: 10px; }
        .sig-line { border-top: 2px solid #000; width: 45%; text-align: center; font-size: 9px; padding-top: 2px; }
        .footer { text-align: center; margin-top: 10px; font-size: 9px; font-style: italic; }
        .big-id { font-size: 18px; border: 2px solid #000; padding: 2px 5px; }
      </style>
    </head>
    <body>
      <div class="header center">
        <div style="font-size: 14px;">DARWIN'S TALLER</div>
        <div style="font-size: 10px;">CONTROL DE TRASLADO INTERNO</div>
        <div style="font-size: 9px;">${dateValue}</div>
      </div>

      <div class="row" style="align-items:center;">
        <span>Orden ID:</span>
        <span class="big-id">${displayId}</span>
      </div>

      <div class="route-box">
        DE: ${fromBranch} <br/>
        ⬇ <br/>
        PARA: ${toBranch}
      </div>

      <div class="row"><span>Equipo:</span> <span>${order.deviceModel}</span></div>
      ${order.imei ? `<div class="row"><span>IMEI:</span> <span>${order.imei}</span></div>` : ''}
      
      <div style="margin-top: 5px; border-top: 2px dashed #000; pt-2">
        <span style="font-size: 10px;">Nota / Falla:</span><br/>
        ${order.deviceIssue.substring(0, 60)}${order.deviceIssue.length > 60 ? '...' : ''}
      </div>

      <div class="signatures">
        <div class="sig-line">Despachado Por</div>
        <div class="sig-line">Recibido Por</div>
      </div>
      
      <div class="footer">
        Este documento certifica el movimiento de inventario entre sucursales.
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  const savedPrinter = localStorage.getItem('receiptPrinterName');
  const useRawPrinting = localStorage.getItem('useRawPrinting') === 'true';

  if (savedPrinter) {
    if (useRawPrinting) {
      try {
        const commands = getTransferManifestRawCommands(order, fromBranch, toBranch);
        await printRawEscPos(savedPrinter, commands);
        return;
      } catch (err) {
        console.warn("Error printing raw manifest:", err);
      }
    } else {
      await printHtmlAsImage(content, savedPrinter, 280, 80);
    }
    return;
  }

  const printWindow = openPrintWindow();
  if (!printWindow) return;
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
};

export const getCashCountRawCommands = (payments: Payment[], cashierName: string, totals: { cash: number, transfer: number, card: number, credit: number, total: number }): string[] => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\x0A';
  
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const right = ESC + 'a' + '\x02';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleSize = GS + '!' + '\x11';
  const normalSize = GS + '!' + '\x00';
  const cut = GS + 'V' + '\x41' + '\x10';
  
  const dateValue = new Date().toLocaleString('es-ES');
  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  
  const getDisplayId = (p: Payment) => {
    if (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE'].includes(p.orderId)) {
      return `G-${(p as any).orderReadableId || p.orderId.slice(-4)}`;
    }
    if (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(p.orderId)) {
      return `V-${(p as any).orderReadableId || p.orderId.slice(-4)}`;
    }
    return (p as any).orderReadableId ? `#${(p as any).orderReadableId}` : `#${typeof p.orderId === 'string' ? p.orderId.slice(-4) : '---'}`;
  };

  const incomes = payments.filter(p => p.amount >= 0);
  const expenses = payments.filter(p => p.amount < 0);

  const cmds: string[] = [];
  cmds.push(init);
  cmds.push(center);
  cmds.push(boldOn + doubleSize + "CORTE DE CAJA" + normalSize + boldOff + LF);
  cmds.push(dateValue + LF);
  cmds.push("Cajero: " + removeAccents(cashierName) + LF);
  cmds.push("--------------------------------" + LF);
  
  cmds.push(left);
  cmds.push(boldOn + "RESUMEN DE TOTALES:" + boldOff + LF);
  cmds.push("Efectivo:".padEnd(24) + "$" + totals.cash.toFixed(2) + LF);
  cmds.push("Transferencia:".padEnd(24) + "$" + totals.transfer.toFixed(2) + LF);
  cmds.push("Tarjeta:".padEnd(24) + "$" + totals.card.toFixed(2) + LF);
  cmds.push("Credito:".padEnd(24) + "$" + totals.credit.toFixed(2) + LF);
  cmds.push("--------------------------------" + LF);
  cmds.push(right + boldOn + doubleSize + "TOTAL: $" + totals.total.toFixed(2) + normalSize + boldOff + LF);
  
  cmds.push(left + "--------------------------------" + LF);
  cmds.push(boldOn + "ENTRADAS DE DINERO:" + boldOff + LF);
  
  if (incomes.length > 0) {
      incomes.forEach(p => {
          const idStr = getDisplayId(p) + " (" + p.method.substring(0,3) + ")";
          const amountStr = "$" + p.amount.toFixed(2);
          cmds.push(idStr.padEnd(24) + amountStr + LF);
          if (p.orderModel) {
              cmds.push("  " + removeAccents(p.orderModel.substring(0, 30)) + LF);
          }
      });
  } else {
      cmds.push("Sin entradas" + LF);
  }

  cmds.push("--------------------------------" + LF);
  cmds.push(boldOn + "SALIDAS / GASTOS:" + boldOff + LF);
  
  if (expenses.length > 0) {
      expenses.forEach(p => {
          const idStr = getDisplayId(p) + " (" + p.method.substring(0,3) + ")";
          const amountStr = "-$" + Math.abs(p.amount).toFixed(2);
          cmds.push(idStr.padEnd(24) + amountStr + LF);
          if (p.orderModel) {
              cmds.push("  " + removeAccents(p.orderModel.substring(0, 30)) + LF);
          }
      });
  } else {
      cmds.push("Sin gastos" + LF);
  }

  cmds.push("--------------------------------" + LF);
  cmds.push(center);
  cmds.push("================================" + LF);
  cmds.push(boldOn + "EFECTIVO ESPERADO EN CAJA" + boldOff + LF);
  cmds.push(boldOn + doubleSize + "$" + totals.cash.toFixed(2) + normalSize + boldOff + LF);
  cmds.push("================================" + LF);
  
  cmds.push(LF + LF + LF);
  cmds.push(center + "__________________________" + LF);
  cmds.push("Firma Responsable" + LF);
  cmds.push(LF + LF + LF + cut);
  
  return cmds;
};

export const printCashCount = async (payments: Payment[], cashierName: string, totals: { cash: number, transfer: number, card: number, credit: number, cambiazo: number, total: number }) => {
  const dateValue = new Date().toLocaleString('es-ES');

  const incomes = payments.filter(p => p.amount >= 0);
  const expenses = payments.filter(p => p.amount < 0);

  const getDisplayId = (p: Payment) => {
    if (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE'].includes(p.orderId)) {
      return `G-${(p as any).orderReadableId || p.orderId.slice(-4)}`;
    }
    if (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(p.orderId)) {
      return `V-${(p as any).orderReadableId || p.orderId.slice(-4)}`;
    }
    return (p as any).orderReadableId ? `#${(p as any).orderReadableId}` : `#${typeof p.orderId === 'string' ? p.orderId.slice(-4) : '---'}`;
  };

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>CORTE DE CAJA</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: 'Courier New', monospace; margin: 0; padding: 5px; width: 72mm; box-sizing: border-box; font-size: 11px; }
        * { font-weight: bold !important; }
        .center { text-align: center; }
        .header { margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 5px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .section { margin-top: 10px; border-top: 2px dashed #000; padding-top: 5px; margin-bottom: 5px; font-size: 12px; }
        .highlight { font-size: 13px; }
        .method-box { border: 2px solid #000; padding: 3px; margin-bottom: 2px; }
        .cashier-info { font-size: 10px; margin-bottom: 10px; }
        .expected-cash { 
            margin-top: 15px; 
            border: 3px solid #000; 
            padding: 8px; 
            text-align: center; 
            background-color: #f0f0f0;
            border-radius: 4px;
        }
        .expected-cash-title { font-size: 14px; margin-bottom: 5px; text-transform: uppercase; }
        .expected-cash-amount { font-size: 24px; font-weight: 900 !important; }
      </style>
    </head>
    <body>
      <div class="header center">
        <div style="font-size: 14px;">DARWIN'S TALLER</div>
        <div>PRE-CORTE DE CAJA</div>
        <div style="font-size: 10px;">${dateValue}</div>
      </div>

      <div class="cashier-info">
        <span>Cajero(s):</span><br/>
        <span>${cashierName}</span>
      </div>
      
      <div class="section" style="margin-bottom: 10px;">RESUMEN POR MÉTODO:</div>
      
      <div class="method-box row"><span>[EFE] Efectivo:</span> <span class="highlight">$${totals.cash.toLocaleString()}</span></div>
      <div class="method-box row"><span>[TAR] Tarjeta:</span> <span class="highlight">$${totals.card.toLocaleString()}</span></div>
      <div class="method-box row"><span>[TRA] Transf.:</span> <span class="highlight">$${totals.transfer.toLocaleString()}</span></div>
      <div class="method-box row"><span>[CRE] Crédito:</span> <span class="highlight">$${totals.credit.toLocaleString()}</span></div>
      <div class="method-box row"><span>[CMB] Cambiazo:</span> <span class="highlight">$${totals.cambiazo.toLocaleString()}</span></div>
      
      <div class="section row" style="font-size: 16px; border-top: 2px solid #000; padding-top: 8px;">
        <span>TOTAL TURNO:</span>
        <span>$${totals.total.toLocaleString()}</span>
      </div>

      <div class="section">ENTRADAS DE DINERO:</div>
      ${incomes.length > 0 ? incomes.map(p => `
        <div style="margin-bottom: 3px; border-bottom: 1px dotted #000; padding-bottom: 2px;">
            <div class="row" style="font-size: 10px; margin-bottom: 0;">
                <span>${getDisplayId(p)} (${p.method.substring(0,3)})</span>
                <span>$${p.amount.toLocaleString()}</span>
            </div>
            ${p.orderModel ? `<div style="font-size: 9px;">${p.orderModel.substring(0,25)}</div>` : ''}
        </div>
      `).join('') : '<div style="font-size: 10px; text-align: center;">Sin entradas</div>'}

      <div class="section">SALIDAS / GASTOS:</div>
      ${expenses.length > 0 ? expenses.map(p => `
        <div style="margin-bottom: 3px; border-bottom: 1px dotted #000; padding-bottom: 2px;">
            <div class="row" style="font-size: 10px; margin-bottom: 0;">
                <span>${getDisplayId(p)} (${p.method.substring(0,3)})</span>
                <span>-$${Math.abs(p.amount).toLocaleString()}</span>
            </div>
            ${p.orderModel ? `<div style="font-size: 9px;">${p.orderModel.substring(0,25)}</div>` : ''}
        </div>
      `).join('') : '<div style="font-size: 10px; text-align: center;">Sin gastos</div>'}

      <div class="expected-cash">
        <div class="expected-cash-title">Efectivo Esperado en Caja</div>
        <div class="expected-cash-amount">$${totals.cash.toLocaleString()}</div>
      </div>

      <div class="center" style="margin-top: 30px; font-size: 10px;">
        _____________________<br/>
        Firma Responsable
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const savedPrinter = localStorage.getItem('receiptPrinterName');
  const useRawPrinting = localStorage.getItem('useRawPrinting') === 'true';

  if (savedPrinter) {
    if (useRawPrinting) {
      try {
        const commands = getCashCountRawCommands(payments, cashierName, totals);
        await printRawEscPos(savedPrinter, commands);
        return;
      } catch (err) {
        console.warn("Error printing raw cash count:", err);
      }
    } else {
      await printHtmlAsImage(content, savedPrinter, 280, 80);
    }
    return;
  }

  const printWindow = openPrintWindow();
  if (!printWindow) return;
  printWindow.document.write(content);
  printWindow.document.close();
};

export const getInvoiceHtml = (order: RepairOrder, forceType?: 'INTAKE' | 'FINAL') => {
  let isFinal = order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED;
  if (forceType === 'INTAKE') isFinal = false;
  if (forceType === 'FINAL') isFinal = true;
  
  const isReturn = order.returnRequest?.status === RequestStatus.APPROVED || (order.isRepairSuccessful === false && isFinal);

  let paymentsHtml = '';
  if (order.payments && order.payments.length > 0) {
      paymentsHtml = `
      <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #000;">
        <div style="font-size: 10px; text-transform: uppercase; margin-bottom: 6px; font-weight: bold;">Pagos Realizados</div>
        ${order.payments.map(p => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                <span>${p.method} ${p.isRefund ? '<span style="font-size: 10px; border: 1px solid #000; padding: 1px 3px; border-radius: 2px;">DEV</span>' : ''}</span>
                <span style="font-weight: bold;">$${p.amount.toFixed(2)}</span>
            </div>
        `).join('')}
      </div>
      `;
  }

  const isStore = order.orderType === OrderType.STORE;
  const isPartSale = order.orderType === OrderType.PART_ONLY;
  const isPOSSale = isPartSale && order.deviceModel === 'Artículos de Inventario';
  const serviceLabel = isPartSale ? 'Artículos' : (isStore ? 'Costo de Compra' : (isReturn ? 'Costo Chequeo/Diagnóstico' : 'Reparación/Servicio'));
  const finalAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.finalPrice || 0));
  const estimatedAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.estimatedCost || 0));

  const amountToUse = (isFinal || isPartSale) ? finalAmount : estimatedAmount;
  const subtotal = amountToUse / 1.18;
  const itbis = amountToUse - subtotal;

  let docTitle = isFinal ? "FACTURA FINAL" : "RECIBO DE INGRESO";
  if (isReturn) docTitle = "COMPROBANTE DE DEVOLUCIÓN";
  if (isPartSale) docTitle = "FACTURA DE VENTA";

  const dateValue = new Date().toLocaleString('es-ES', { 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit' 
  });
  
  let invoiceIdStr = order.readable_id 
    ? order.readable_id.toString() 
    : (order.id.startsWith('INV-') 
        ? order.id 
        : (order.id.startsWith('PROD-') 
            ? order.id 
            : order.id.slice(-6).toUpperCase()
          )
      );
  if ((order as any).posInvoiceNumber) {
    invoiceIdStr = (order as any).posInvoiceNumber;
  } else if (isPOSSale && order.devicePassword && order.devicePassword !== 'N/A') {
    invoiceIdStr = order.devicePassword;
  }
  
  const displayIdHtml = isPOSSale
    ? `<span style="font-size: 18px; font-weight: 900; letter-spacing: 1px;">${invoiceIdStr.includes('INV-') ? invoiceIdStr : `INV-${invoiceIdStr}`}</span>`
    : `<span style="font-size: 20px; font-weight: 900; letter-spacing: 1px;">#${invoiceIdStr}</span>`;

  return `
    <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; width: 100%; max-width: 76mm; margin: 0 auto; box-sizing: border-box; font-size: 12px; color: #000; background-color: #ffffff;">
      
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 15px; border-bottom: 3px solid #000; padding-bottom: 10px;">
        <div style="font-size: 26px; font-weight: 900; letter-spacing: -1px; margin-bottom: 4px; text-transform: uppercase;">Darwin's Taller</div>
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">📍Bani, frente a la central de claro</div>
        <div style="font-size: 12px; font-weight: 600;">${order.currentBranch || 'Sucursal Principal'}</div>
      </div>

      <!-- WhatsApp Header -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 15px; padding: 8px; background-color: #f0fff4; border-radius: 10px; border: 1px solid #dcfce7;">
        <span style="font-size: 9px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 1px;">WhatsApp</span>
        <svg viewBox="0 0 24 24" width="32" height="32" fill="#25D366" style="display: block; filter: drop-shadow(0 2px 4px rgba(37, 211, 102, 0.2));">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span style="font-size: 20px; font-weight: 900; color: #000; letter-spacing: -0.5px;">(849) 506-8007</span>
      </div>

      <!-- Document Type & ID -->
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #000; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
          ${docTitle}
        </div>
        <div style="margin: 4px 0;">
          ${displayIdHtml}
        </div>
        <div style="font-size: 12px; font-weight: 600; color: #333;">${dateValue}</div>
      </div>

      <!-- Customer Info -->
      <div style="margin-bottom: 15px; padding-bottom: 10px;">
        <div style="font-size: 10px; text-transform: uppercase; margin-bottom: 2px; font-weight: 800; color: #555;">Cliente</div>
        <div style="font-size: 18px; font-weight: 900; margin-bottom: 2px;">${order.customer?.name || 'Cliente POS'}</div>
        <div style="font-size: 14px; font-weight: 600;">Tel: ${order.customer?.phone || 'S/N'}</div>
      </div>
      
      <!-- Device Info (HIGHLIGHTED) -->
      <div style="margin-bottom: 20px; text-align: center; border: 2px solid #000; border-radius: 8px; padding: 12px; background-color: #f9f9f9;">
        <div style="font-size: 10px; text-transform: uppercase; margin-bottom: 4px; font-weight: 800; letter-spacing: 1px;">${isPOSSale ? 'Artículos' : 'Equipo'}</div>
        <div style="font-size: 22px; font-weight: 900; margin-bottom: 6px; line-height: 1.1;">${isPOSSale ? order.deviceIssue : order.deviceModel}</div>
        ${order.imei ? `<div style="font-size: 14px; margin-bottom: 8px; font-family: 'Courier New', monospace; font-weight: bold; background: #e0e0e0; display: inline-block; padding: 2px 6px; border-radius: 4px;">IMEI: ${order.imei}</div>` : ''}
        
        ${!isPOSSale ? `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc; text-align: left;">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px; color: #555;">Falla Reportada:</div>
          <div style="font-size: 14px; font-weight: 700; line-height: 1.3;">${order.deviceIssue}</div>
        </div>
        ` : ''}
      </div>

      ${isReturn ? `
        <div style="margin: 15px 0; border: 2px dashed #000; padding: 10px; text-align: center; font-size: 12px; font-weight: 900; text-transform: uppercase; background-color: #f0f0f0;">
            Equipo devuelto sin reparar.<br/>
            El monto cobrado corresponde a chequeo técnico y diagnóstico.
        </div>
      ` : ''}

      <!-- Financials (HIGHLIGHTED) -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 12px; color: #555;">
          <span style="font-weight: 600; text-transform: uppercase;">Subtotal</span>
          <span style="font-weight: 700;">$${subtotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; color: #555;">
          <span style="font-weight: 600; text-transform: uppercase;">ITBIS (18%)</span>
          <span style="font-weight: 700;">$${itbis.toFixed(2)}</span>
        </div>

        ${isFinal ? 
          `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px;">
              <span style="font-weight: 700; text-transform: uppercase;">${serviceLabel}</span>
              <span style="font-weight: 900;">$${finalAmount.toFixed(2)}</span>
           </div>` 
          : 
          `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px;">
              <span style="font-weight: 700; text-transform: uppercase;">${isStore ? 'Precio de Compra' : 'Presupuesto'}</span> 
              <span style="font-weight: 900;">$${estimatedAmount.toFixed(2)}</span>
           </div>
           ${!isStore ? `<div style="font-size: 10px; font-style: italic; text-align: right; margin-top: 2px; font-weight: 600;">* Sujeto a revisión técnica</div>` : ''}`
        }

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 3px solid #000; font-size: 28px; font-weight: 900;">
          <span>TOTAL</span>
          <span>$${amountToUse.toFixed(2)}</span>
        </div>

        ${paymentsHtml}
      </div>

      <!-- Warranty / Terms (REDESIGNED BOX) -->
      <div style="margin-top: 35px; border-left: 2px solid #000; border-right: 2px solid #000; border-bottom: 2px solid #000; border-radius: 0 0 8px 8px; padding: 15px 10px 10px 10px; position: relative;">
        <div style="position: absolute; top: -14px; left: -2px; right: -2px; display: flex; align-items: center;">
          <div style="flex-grow: 1; height: 2px; background: black;"></div>
          <div style="font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; background: white; padding: 0 10px; line-height: 1;">${isPartSale ? 'POLÍTICAS' : 'GARANTÍA'}</div>
          <div style="flex-grow: 1; height: 2px; background: black;"></div>
        </div>
        <div style="font-size: 9px; text-align: justify; line-height: 1.5; font-weight: 600;">
          ${isPOSSale ? 
             `1. Equipos usados/Clase A (sin caja) tienen 30 días de garantía.<br/>
              2. Equipos nuevos en caja tienen 90 días de garantía.<br/>
              3. Accesorios tienen 15 días de garantía.<br/>
              4. La garantía pierde validez si el equipo presenta golpes, humedad o ha sido destapado.<br/>
              <div style="font-size: 11px; margin-top: 6px; text-align: center; font-weight: 900; text-transform: uppercase; border: 1px solid #000; padding: 2px;">5. NO HACEMOS DEVOLUCIONES DE DINERO.</div>`
          : isPartSale ? 
            `1. Revise su mercancía antes de salir.<br/>
             2. Cambios solo por defectos de fábrica dentro de 7 días, con recibo y empaque original.<br/>
             3. Baterías y displays pierden garantía si se retiran los plásticos o sellos.<br/>
             <div style="font-size: 11px; margin-top: 6px; text-align: center; font-weight: 900; text-transform: uppercase; border: 1px solid #000; padding: 2px;">4. NO HACEMOS DEVOLUCIONES DE DINERO.</div>` 
            : 
            `1. Pantallas GENÉRICAS NO tienen garantía.<br/>
             2. Pantallas ORIGINALES tienen 15 días de prueba.<br/>
             3. No cubrimos daños por agua o reparaciones de terceros post-entrega.<br/>
             4. Equipos abandonados en 90 días pasan a reciclaje.<br/>
             5. Todo equipo debe ser revisado al momento de su entrega.<br/>
             6. Damos garantía estrictamente por el componente reparado. No nos hacemos responsables de funcionamientos ajenos a la reparación original.<br/>
             <div style="font-size: 11px; margin-top: 6px; font-weight: 900; text-align: center; text-transform: uppercase; border: 1px solid #000; padding: 2px;">7. NO HACEMOS DEVOLUCIONES DE DINERO.</div>`
          }
          <div style="margin-top: 8px; text-align: center; font-weight: 900; font-size: 10px; text-transform: uppercase;">Al firmar este recibo, el cliente acepta estos términos.</div>
        </div>
      </div>

      <!-- Signature -->
      <div style="margin-top: 60px; text-align: center;">
        <div style="border-top: 2px solid #000; width: 90%; margin: 0 auto; padding-top: 8px;">
          <span style="font-size: 14px; font-weight: 900; text-transform: uppercase;">Firma del Cliente</span>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 30px; font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
        ¡Gracias por preferirnos!
      </div>
      
      <!-- Bottom spacing for printer cut -->
      <div style="height: 30px;"></div>
    </div>
  `;
};

// FIX: Accept optional targetWindow to allow pre-opening windows to bypass blockers
export const getWhatsAppInvoiceHtml = (order: RepairOrder) => {
  const isFinal = order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED;
  const isReturn = order.returnRequest?.status === RequestStatus.APPROVED || (order.isRepairSuccessful === false && isFinal);
  
  let docTitle = isFinal ? "FACTURA FINAL" : "RECIBO DE INGRESO";
  if (isReturn) docTitle = "COMPROBANTE DE DEVOLUCIÓN";
  if (order.orderType === OrderType.PART_ONLY) docTitle = "FACTURA DE VENTA";

  const dateValue = new Date().toLocaleString('es-ES');
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;

  let paymentsHtml = '';
  if (order.payments && order.payments.length > 0) {
      paymentsHtml = `
      <div style="border-top: 2px dashed #e2e8f0; margin: 16px 0;"></div>
      <div style="margin-top: 8px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">PAGOS REALIZADOS:</div>
      ${order.payments.map(p => `
          <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 14px; align-items: center;">
              <span style="color: #64748b; display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #10b981;"></span>
                ${p.method} ${p.isRefund ? '(DEV.)' : ''}
              </span>
              <span style="font-weight: 600; color: #0f172a;">$${p.amount.toFixed(2)}</span>
          </div>
      `).join('')}
      `;
  }

  const isStore = order.orderType === OrderType.STORE;
  const isPartSale = order.orderType === OrderType.PART_ONLY;
  const serviceLabel = isPartSale ? 'Artículos' : (isStore ? 'Costo de Compra' : (isReturn ? 'Costo Chequeo/Diagnóstico' : 'Reparación/Servicio'));
  const finalAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.finalPrice || 0));
  const estimatedAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.estimatedCost || 0));

  const amountToUse = (isFinal || isPartSale) ? finalAmount : estimatedAmount;
  const subtotal = amountToUse / 1.18;
  const itbis = amountToUse - subtotal;

  // Modern, highly colorful and professional design for WhatsApp
  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; padding: 0; width: 380px; box-sizing: border-box; font-size: 14px; color: #1e293b; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
      
      <!-- Header with Gradient -->
      <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px 24px; text-align: center; color: white; position: relative;">
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 60%); pointer-events: none;"></div>
        
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background-color: rgba(255, 255, 255, 0.2); border-radius: 16px; margin-bottom: 16px; font-weight: 800; font-size: 28px; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          DT
        </div>
        <div style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Darwin's Taller</div>
        <div style="font-size: 13px; opacity: 0.9; margin-bottom: 2px;">📍Bani, frente a la central de claro</div>
        <div style="font-size: 13px; opacity: 0.9;">Tel: (849) 506-8007</div>
      </div>

      <div style="padding: 24px;">
        <!-- Title & ID -->
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 6px 16px; background-color: ${isFinal ? '#ecfdf5' : '#eff6ff'}; color: ${isFinal ? '#059669' : '#2563eb'}; border-radius: 24px; font-size: 13px; font-weight: 800; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid ${isFinal ? '#a7f3d0' : '#bfdbfe'};">
            ${docTitle}
          </div>
          <div style="font-size: 42px; font-weight: 900; color: #0f172a; letter-spacing: -1.5px; line-height: 1; margin-bottom: 8px;">
            ${displayId}
          </div>
          <div style="font-size: 13px; color: #64748b; font-weight: 500;">${dateValue}</div>
        </div>

        <!-- Customer Info -->
        <div style="background-color: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 20px; border: 1px solid #f1f5f9;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center;">
            <span style="color: #64748b; font-size: 13px; font-weight: 500;">Cliente</span> 
            <span style="font-weight: 700; color: #0f172a; font-size: 15px;">${order.customer.name.substring(0, 20)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b; font-size: 13px; font-weight: 500;">Teléfono</span> 
            <span style="font-weight: 600; color: #3b82f6; font-size: 15px;">${order.customer.phone}</span>
          </div>
        </div>
        
        <!-- Device Info -->
        <div style="margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="flex: 1; height: 1px; background-color: #e2e8f0;"></span>
            Detalles del Equipo
            <span style="flex: 1; height: 1px; background-color: #e2e8f0;"></span>
          </div>
          
          <div style="text-align: center; margin-bottom: 16px;">
            <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${order.deviceModel}</div>
            ${order.imei ? `<div style="font-size: 13px; color: #64748b; font-family: monospace; background: #f1f5f9; display: inline-block; padding: 4px 10px; border-radius: 6px;">IMEI: ${order.imei}</div>` : ''}
          </div>
          
          <div style="background: linear-gradient(to right, #fffbeb, #fef3c7); border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 12px 12px 0; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.05);">
            <div style="font-size: 12px; color: #b45309; font-weight: 800; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Falla Reportada</div>
            <div style="font-size: 15px; color: #92400e; line-height: 1.4; font-weight: 500;">${order.deviceIssue}</div>
          </div>
        </div>
        
        ${isReturn ? `
          <div style="margin: 20px 0; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; text-align: center; color: #b91c1c; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.05);">
              <div style="font-weight: 800; margin-bottom: 6px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Equipo devuelto sin reparar</div>
              <div style="font-size: 13px; opacity: 0.9;">El monto cobrado corresponde a chequeo técnico, uso de maquinaria y diagnóstico.</div>
          </div>
        ` : ''}

        <div style="border-top: 2px dashed #e2e8f0; margin: 20px 0;"></div>

        <!-- Pricing -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #64748b;">
          <span>Subtotal</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; color: #64748b;">
          <span>ITBIS (18%)</span>
          <span>$${itbis.toFixed(2)}</span>
        </div>

        ${isFinal ? 
          `<div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 15px; align-items: center;">
              <span style="color: #475569; font-weight: 500;">${serviceLabel}</span>
              <span style="font-weight: 600; color: #0f172a;">$${finalAmount.toFixed(2)}</span>
           </div>` 
          : 
          `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; align-items: center;">
              <span style="color: #475569; font-weight: 600;">${isStore ? 'Precio de Compra' : 'Precio Estimado'}</span> 
              <span style="font-weight: 800; color: #0f172a; font-size: 18px;">$${estimatedAmount.toFixed(2)}</span>
           </div>
           ${!isStore ? `<div style="font-size: 12px; color: #94a3b8; font-style: italic; text-align: right;">* Sujeto a revisión técnica final.</div>` : ''}`
        }

        <div style="margin-top: 20px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
          <span style="font-size: 16px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 1px;">Total</span>
          <span style="font-size: 32px; font-weight: 900; color: #2563eb; letter-spacing: -1px;">$${amountToUse.toFixed(2)}</span>
        </div>

        ${paymentsHtml}

        <div style="border-top: 2px dashed #e2e8f0; margin: 24px 0;"></div>
        
        <!-- Terms -->
        <div style="font-size: 12px; color: #64748b; line-height: 1.6; background-color: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #f1f5f9;">
          <div style="font-weight: 800; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px;">${isPartSale ? 'Políticas de Garantía' : 'Términos y Garantía'}</div>
          ${isPartSale ? 
            `<ul style="margin: 0; padding-left: 20px; font-weight: 500;">
              <li style="margin-bottom: 4px;">Garantía de 30 días para equipos Clase A (sin caja).</li>
              <li style="margin-bottom: 4px;">Garantía de 90 días para equipos Nuevos (de caja).</li>
              <li style="margin-bottom: 4px;">Revise su mercancía antes de salir. Cambios solo por defectos de fábrica.</li>
              <li style="margin-bottom: 4px;">Baterías y displays pierden garantía si se retiran los plásticos o sellos.</li>
             </ul>`
            :
            `<ol style="margin: 0; padding-left: 20px; font-weight: 500;">
              <li style="margin-bottom: 4px;">Pantallas GENÉRICAS NO tienen garantía.</li>
              <li style="margin-bottom: 4px;">Pantallas ORIGINALES tienen 15 días de prueba.</li>
              <li style="margin-bottom: 4px;">No cubrimos daños por agua o golpes post-entrega.</li>
              <li style="margin-bottom: 4px;">Equipos no retirados en 90 días pasan a reciclaje.</li>
              <li style="margin-bottom: 4px;">Todo equipo debe ser revisado al momento de la entrega.</li>
            </ol>`
          }
        </div>
        
        <div style="text-align: center; margin-top: 24px; font-size: 14px; font-weight: 700; color: #2563eb; background-color: #eff6ff; padding: 16px; border-radius: 12px; border: 1px dashed #bfdbfe;">
          ¡Gracias por su preferencia! ✨
        </div>
      </div>
    </div>
  `;
};

export const getInvoiceRawCommands = (order: RepairOrder, forceType?: 'INTAKE' | 'FINAL'): string[] => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LF = '\x0A';
  
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const right = ESC + 'a' + '\x02';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleSize = GS + '!' + '\x11';
  const normalSize = GS + '!' + '\x00';
  const doubleHeight = GS + '!' + '\x01';
  const fontB = ESC + 'M' + '\x01';
  const fontA = ESC + 'M' + '\x00';
  const cut = GS + 'V' + '\x41' + '\x10';
  const invertOn = GS + 'B' + '\x01';
  const invertOff = GS + 'B' + '\x00';
  
  let isFinal = order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED;
  if (forceType === 'INTAKE') isFinal = false;
  if (forceType === 'FINAL') isFinal = true;
  
  const isReturn = order.returnRequest?.status === RequestStatus.APPROVED || (order.isRepairSuccessful === false && isFinal);
  
  const isStore = order.orderType === OrderType.STORE;
  const isPartSale = order.orderType === OrderType.PART_ONLY;

  let docTitle = isFinal ? "FACTURA FINAL" : "RECIBO DE INGRESO";
  if (isReturn) docTitle = "COMPROBANTE DE DEVOLUCION";
  if (isPartSale) docTitle = "FACTURA DE VENTA";

  const dateValue = new Date().toLocaleString('es-ES');
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;

  const serviceLabel = isPartSale ? 'Articulos' : (isStore ? 'Costo de Compra' : (isReturn ? 'Costo Chequeo/Diag.' : 'Reparacion/Servicio'));
  const finalAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.finalPrice || 0));
  const estimatedAmount = isStore ? (order.purchaseCost || 0) : (order.totalAmount ?? (order.estimatedCost || 0));

  const amountToUse = (isFinal || isPartSale) ? finalAmount : estimatedAmount;
  const subtotal = amountToUse / 1.18;
  const itbis = amountToUse - subtotal;

  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  // Helper for 48-character width alignment
  const justify = (leftStr: string, rightStr: string, width: number = 48) => {
      const spaces = width - leftStr.length - rightStr.length;
      if (spaces > 0) {
          return leftStr + " ".repeat(spaces) + rightStr;
      }
      return leftStr + " " + rightStr;
  };

  // PC437 Box Drawing Characters
  const topLeft = '\xDA';
  const topRight = '\xBF';
  const bottomLeft = '\xC0';
  const bottomRight = '\xD9';
  const horizontal = '\xC4';
  const vertical = '\xB3';
  const doubleHorizontal = '\xCD';

  const separator = horizontal.repeat(48) + LF;
  const thickSeparator = doubleHorizontal.repeat(48) + LF;

  const cmds: string[] = [];
  cmds.push(init);
  cmds.push(LF); // Add a small margin at the top so the logo/name doesn't get cut
  
  // --- HEADER ---
  cmds.push(center);
  cmds.push(boldOn + doubleSize + "Darwin's Taller" + normalSize + boldOff + LF);
  cmds.push(removeAccents("Bani, frente a la central de claro") + LF);
  cmds.push(removeAccents(order.currentBranch || 'Sucursal Principal') + LF);
  cmds.push("WhatsApp: " + boldOn + "(849) 506-8007" + boldOff + LF);
  cmds.push(LF);

  // --- DOCUMENT INFO ---
  cmds.push(center);
  cmds.push(invertOn + boldOn + " " + docTitle + " " + boldOff + invertOff + LF);
  cmds.push(LF);
  
  // Large Box for Order Number
  cmds.push(ESC + 't' + '\x00'); // Select PC437 for solid lines and boxes
  cmds.push(ESC + '3' + '\x26'); // 38 dots line spacing for double size to ensure no vertical gaps
  cmds.push(doubleSize);
  const textOrder = "ORDEN " + displayId;
  const boxWidthLg = textOrder.length + 4; // Tight fit: text + 2 spaces padding + 2 borders
  const boxBorderTopLg = topLeft + horizontal.repeat(boxWidthLg - 2) + topRight + LF;
  const boxBorderBottomLg = bottomLeft + horizontal.repeat(boxWidthLg - 2) + bottomRight + LF;
  const boxLineLg = vertical + " " + textOrder + " " + vertical + LF;
  
  cmds.push(boldOn);
  cmds.push(boxBorderTopLg);
  cmds.push(boxLineLg);
  cmds.push(boxBorderBottomLg);
  cmds.push(boldOff);
  cmds.push(normalSize);
  cmds.push(ESC + '2'); // Reset line spacing
  cmds.push(ESC + 't' + '\x02'); // Reset code page to default
  cmds.push(LF);
  
  // --- CUSTOMER INFO ---
  cmds.push(left);
  cmds.push(dateValue + LF);
  cmds.push(boldOn + "CLIENTE: " + boldOff + removeAccents(order.customer.name) + LF);
  cmds.push(boldOn + "TEL: " + boldOff + order.customer.phone + LF);
  
  // --- DEVICE INFO ---
  cmds.push(center);
  
  const deviceModelStr = removeAccents(order.deviceModel);
  cmds.push(boldOn + doubleHeight + deviceModelStr + normalSize + boldOff + LF);
  
  if (order.imei) cmds.push("IMEI: " + order.imei + LF);
  
  cmds.push(left);
  cmds.push(boldOn + "FALLA REPORTADA:" + boldOff + LF);
  cmds.push(removeAccents(order.deviceIssue) + LF);
  
  if (isReturn) {
      cmds.push(LF);
      cmds.push(center + thickSeparator);
      cmds.push(boldOn + "EQUIPO DEVUELTO SIN REPARAR." + boldOff + LF);
      cmds.push("EL MONTO COBRADO CORRESPONDE A" + LF);
      cmds.push("CHEQUEO TECNICO Y DIAGNOSTICO." + LF);
      cmds.push(thickSeparator + left);
  }
  
  cmds.push(separator);
  
  // --- FINANCIALS ---
  cmds.push(left);
  cmds.push(justify("Subtotal:", "$" + subtotal.toFixed(2)) + LF);
  cmds.push(justify("ITBIS (18%):", "$" + itbis.toFixed(2)) + LF);
  cmds.push(LF);

  if (isFinal) {
      cmds.push(boldOn + justify("SERVICIO", "VALOR") + boldOff + LF);
      cmds.push(justify(serviceLabel, "$" + finalAmount.toFixed(2)) + LF);
      cmds.push(LF);
      cmds.push(right + boldOn + doubleSize + "TOTAL: $" + finalAmount.toFixed(2) + normalSize + boldOff + LF);
  } else {
      const estLabel = isStore ? 'PRECIO DE COMPRA:' : 'PRESUPUESTO:';
      cmds.push(boldOn + justify(estLabel, "$" + estimatedAmount.toFixed(2)) + boldOff + LF);
      if (!isStore) cmds.push(fontB + "* Sujeto a revision tecnica final." + fontA + LF);
      cmds.push(LF);
      cmds.push(right + boldOn + doubleSize + "TOTAL: $" + estimatedAmount.toFixed(2) + normalSize + boldOff + LF);
  }
  
  if (order.orderType !== OrderType.STORE && order.payments && order.payments.length > 0) {
      cmds.push(left + separator);
      cmds.push(boldOn + "PAGOS REALIZADOS:" + boldOff + LF);
      order.payments.forEach(p => {
          const method = p.method + (p.isRefund ? ' (DEV.)' : '');
          cmds.push(justify(method, "$" + p.amount.toFixed(2)) + LF);
      });
  }
  
  cmds.push(left + LF);
  
  // --- WARRANTY BOX ---
  // We use Font A for clarity and readability.
  // Font A is 48 chars wide.
  
  cmds.push(left + fontA);
  cmds.push(ESC + 't' + '\x00'); // Select PC437 for solid lines and boxes
  
  const boxWidthA = 48;

  const boxBorderTopA = ESC + '3' + '\x18' + topLeft + horizontal.repeat(boxWidthA - 2) + topRight + LF;
  const boxBorderMiddleA = ESC + '3' + '\x18' + '\xC3' + horizontal.repeat(boxWidthA - 2) + '\xB4' + LF;
  const boxBorderBottomA = ESC + '2' + bottomLeft + horizontal.repeat(boxWidthA - 2) + bottomRight + LF;
  
  const boxEmptyA = ESC + '3' + '\x18' + vertical + " ".repeat(boxWidthA - 2) + vertical + LF;
  
  const boxLineA = (text: string, isBold: boolean = false) => {
      const innerWidth = boxWidthA - 4; // 2 chars for "| " and 2 for " |"
      const padLen = innerWidth - text.length;
      const padded = vertical + " " + text + " ".repeat(Math.max(0, padLen)) + " " + vertical;
      return ESC + '3' + '\x18' + (isBold ? (boldOn + padded + boldOff) : padded) + LF;
  };
  const centerInBoxA = (text: string) => {
      const innerWidth = boxWidthA - 4;
      const spaces = innerWidth - text.length;
      const leftSpaces = Math.floor(spaces / 2);
      return " ".repeat(leftSpaces) + text;
  };

  cmds.push(boxBorderTopA);
  cmds.push(boxLineA(centerInBoxA(order.orderType === OrderType.PART_ONLY ? "POLITICAS DE CAMBIO" : "GARANTIA"), true));
  cmds.push(boxBorderMiddleA);
  if (order.orderType === OrderType.PART_ONLY) {
      cmds.push(boxLineA("1. Revise su mercancia antes de salir."));
      cmds.push(boxLineA("2. Cambios solo por defectos de fabrica"));
      cmds.push(boxLineA("   dentro de 7 dias con su recibo original."));
      cmds.push(boxLineA("3. Baterias y displays pierden garantia"));
      cmds.push(boxLineA("   si se retiran los plasticos o sellos."));
      cmds.push(boxEmptyA);
      cmds.push(boxLineA("4. NO HACEMOS DEVOLUCIONES DE DINERO.", true));
  } else {
      cmds.push(boxLineA("1. Pantallas GENERICAS NO tienen garantia."));
      cmds.push(boxLineA("2. Pantallas ORIGINALES tienen 15 dias de"));
      cmds.push(boxLineA("   prueba."));
      cmds.push(boxLineA("3. No cubrimos danos por agua o golpes"));
      cmds.push(boxLineA("   post-entrega."));
      cmds.push(boxLineA("4. Equipos no retirados en 90 dias pasan a"));
      cmds.push(boxLineA("   reciclaje."));
      cmds.push(boxLineA("5. Todo equipo debe ser revisado al momento"));
      cmds.push(boxLineA("   de la entrega."));
      cmds.push(boxLineA("6. Solucionamos cualquier problema,"));
      cmds.push(boxLineA("   referente a la falla que tenia, pero"));
      cmds.push(boxLineA("   solo garantizamos exacta Y explicitamente"));
      cmds.push(boxLineA("   lo reparado. No damos garantia de lo que"));
      cmds.push(boxLineA("   no trabajamos."));
      cmds.push(boxEmptyA);
      cmds.push(boxLineA("7. NO HACEMOS DEVOLUCIONES DE DINERO.", true));
  }
  cmds.push(boxBorderBottomA);
  
  cmds.push(ESC + 't' + '\x02'); // Reset code page
  cmds.push(center + fontA); // Ensure Font A is still active
  cmds.push(boldOn + "Al firmar acepta estos terminos." + boldOff + LF);
  
  // --- SIGNATURE ---
  cmds.push(LF + LF + LF);
  cmds.push(center + "________________________________" + LF);
  cmds.push(boldOn + "Firma del Cliente" + boldOff + LF);
  
  cmds.push(LF + boldOn + "GRACIAS POR PREFERIRNOS!" + boldOff + LF);
  cmds.push(LF + LF + LF + LF + cut);
  
  return cmds;
};

export const printInvoice = async (order: RepairOrder, targetWindow?: Window | null, forceType?: 'INTAKE' | 'FINAL') => {
  const savedPrinter = localStorage.getItem('receiptPrinterName');
  const useRawPrinting = localStorage.getItem('useRawPrinting') === 'true';
  
  if (savedPrinter) {
    if (useRawPrinting) {
      try {
        const commands = getInvoiceRawCommands(order, forceType);
        await printRawEscPos(savedPrinter, commands);
        if (targetWindow) targetWindow.close();
        return;
      } catch (e) {
        console.warn("Error printing raw ESC/POS:", e);
        // Fallback to image printing if raw fails
      }
    }

    try {
      const content = getInvoiceHtml(order, forceType);
      await printHtmlAsImage(content, savedPrinter, 280, 80);
      if (targetWindow) targetWindow.close();
      return;
    } catch (e) {
      console.warn("Error printing HTML as Image via QZTray, falling back to browser print:", e);
    }
  }

  const content = getInvoiceHtml(order, forceType);
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Factura</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      ${content}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  let printWindow = targetWindow;
  
  if (!printWindow) {
      printWindow = window.open('about:blank', '_blank');
  }

  if (!printWindow) {
      alert("Por favor permite ventanas emergentes para imprimir la factura.");
      return;
  }

  // Ensure document is open for writing
  printWindow.document.open();
  
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
};

export const generateInvoiceImage = async (order: RepairOrder): Promise<string | null> => {
  const wrapper = document.createElement('div');
  // Ensure wrapper is in the DOM but not visible to the user
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px'; // Move off-screen instead of opacity: 0
  wrapper.style.top = '0';
  wrapper.style.zIndex = '-9999';
  wrapper.style.pointerEvents = 'none';

  const container = document.createElement('div');
  container.style.width = '380px';
  container.style.backgroundColor = '#ffffff';
  
  const html = getWhatsAppInvoiceHtml(order);
  container.innerHTML = html;
  
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);
  
  try {
    // Wait for images to load if there are any
    const images = Array.from(container.getElementsByTagName('img'));
    if (images.length > 0) {
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // Resolve on error so we don't hang
        });
      }));
    } else {
       // Minimal wait for DOM to settle if no images
       await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    // Ensure the container has a height before capturing
    const height = container.scrollHeight || 800;
    
    const canvas = await html2canvas(container, {
      scale: 1.5,
      backgroundColor: '#ffffff',
      width: 380,
      height: height,
      logging: false,
      useCORS: true
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // Basic check if the image is too small (likely failed)
    if (dataUrl === 'data:,' || dataUrl.length < 1000) {
      console.warn('Generated invoice image seems too small, might be blank');
      return null;
    }
    
    return dataUrl;
  } catch (error) {
    console.warn('Error generating invoice image:', error);
    return null;
  } finally {
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
};

export const printAuditReport = (report: any, selectedSections?: Set<string>) => {

  const printWindow = openPrintWindow();
  if (!printWindow) return;
  
  const discrepancies = report.discrepancies || [];
  const missingItems = discrepancies.filter((d: any) => d.status === 'MISSING' || (!d.status && !d.resolved));
  const reviewItems = discrepancies.filter((d: any) => d.status === 'REVIEW');
  const foundItems = discrepancies.filter((d: any) => d.status === 'FOUND' || d.resolved);
  const waitingResponseItems = discrepancies.filter((d: any) => d.status === 'WAITING_RESPONSE');
  const waitingPartItems = discrepancies.filter((d: any) => d.status === 'WAITING_PART');
  const readyItems = discrepancies.filter((d: any) => d.status === 'READY');
  const alreadyLeftItems = discrepancies.filter((d: any) => d.status === 'ALREADY_LEFT');
  const pendingItems = discrepancies.filter((d: any) => d.status === 'PENDING');
  
  const renderTable = (title: string, items: any[], color: string, sectionKey: string) => {
      if (items.length === 0) return '';
      if (selectedSections && selectedSections.size > 0 && !selectedSections.has('ALL') && !selectedSections.has(sectionKey)) return '';
      return `
        <div class="section-title" style="color: ${color}; border-bottom: 2px solid ${color}; margin-top: 20px;">
            ${title} (${items.length})
        </div>
        <table class="item-table">
            <thead>
                <tr>
                    <th style="width: 15%">ID</th>
                    <th style="width: 35%">Modelo</th>
                    <th style="width: 25%">Cliente</th>
                    <th style="width: 25%">Técnico</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item: any) => `
                    <tr>
                        <td class="mono">#${item.readable_id || item.id.slice(-4)}</td>
                        <td>${item.model}</td>
                        <td>${item.customer}</td>
                        <td>${item.tech}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
      `;
  };

  const contentAudit = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>REPORTE AUDITORÍA</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; padding: 20px; }
        h1 { margin-bottom: 5px; }
        .header { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .stat-box { border: 1px solid #ccc; padding: 10px; border-radius: 5px; min-width: 100px; text-align: center; }
        .stat-val { font-size: 18px; font-weight: bold; }
        .stat-label { font-size: 10px; text-transform: uppercase; color: #666; }
        
        .section-title { font-size: 14px; font-weight: bold; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase; }
        .item-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .item-table th { text-align: left; border-bottom: 1px solid #000; padding: 5px; }
        .item-table td { border-bottom: 1px solid #eee; padding: 5px; }
        .mono { font-family: monospace; font-weight: bold; }
        
        @media print {
            body { padding: 0; }
        }
      </style>
    </head>
    <body>
        <div class="header">
            <h1>Reporte de Auditoría</h1>
            <p><strong>Sucursal:</strong> ${report.branch} &nbsp;|&nbsp; <strong>Fecha:</strong> ${new Date(report.created_at).toLocaleString()} &nbsp;|&nbsp; <strong>Auditor:</strong> ${report.user_name}</p>
            ${report.notes ? `<p><strong>Notas:</strong> ${report.notes}</p>` : ''}
        </div>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-val">${report.total_expected}</div>
                <div class="stat-label">Esperados</div>
            </div>
            <div class="stat-box">
                <div class="stat-val">${report.total_found}</div>
                <div class="stat-label">Encontrados</div>
            </div>
            <div class="stat-box" style="border-color: #ef4444; background: #fef2f2;">
                <div class="stat-val" style="color: #ef4444;">${report.total_missing}</div>
                <div class="stat-label">Faltantes</div>
            </div>
            <div class="stat-box" style="border-color: #64748b; background: #f8fafc;">
                <div class="stat-val" style="color: #64748b;">${pendingItems.length}</div>
                <div class="stat-label">Pendientes</div>
            </div>
            <div class="stat-box" style="border-color: #f59e0b; background: #fffbeb;">
                <div class="stat-val" style="color: #f59e0b;">${reviewItems.length}</div>
                <div class="stat-label">Revisar</div>
            </div>
            <div class="stat-box" style="border-color: #3b82f6; background: #eff6ff;">
                <div class="stat-val" style="color: #3b82f6;">${waitingResponseItems.length}</div>
                <div class="stat-label">Espera Resp.</div>
            </div>
            <div class="stat-box" style="border-color: #a855f7; background: #faf5ff;">
                <div class="stat-val" style="color: #a855f7;">${waitingPartItems.length}</div>
                <div class="stat-label">Espera Pieza</div>
            </div>
            <div class="stat-box" style="border-color: #14b8a6; background: #f0fdfa;">
                <div class="stat-val" style="color: #14b8a6;">${readyItems.length}</div>
                <div class="stat-label">Listos</div>
            </div>
            <div class="stat-box" style="border-color: #f97316; background: #fff7ed;">
                <div class="stat-val" style="color: #f97316;">${alreadyLeftItems.length}</div>
                <div class="stat-label">Ya Salió</div>
            </div>
        </div>
        
        ${renderTable('⚠️ EQUIPOS FALTANTES', missingItems, '#ef4444', 'MISSING')}
        ${renderTable('🟠 EQUIPOS EN REVISIÓN', reviewItems, '#f59e0b', 'REVIEW')}
        ${renderTable('✅ EQUIPOS ENCONTRADOS', foundItems, '#22c55e', 'FOUND')}
        ${renderTable('⏳ ESPERA RESPUESTA', waitingResponseItems, '#3b82f6', 'WAITING_RESPONSE')}
        ${renderTable('🧩 ESPERA PIEZA', waitingPartItems, '#a855f7', 'WAITING_PART')}
        ${renderTable('🎉 LISTOS', readyItems, '#14b8a6', 'READY')}
        ${renderTable('🚀 YA SALIÓ', alreadyLeftItems, '#f97316', 'ALREADY_LEFT')}
        ${renderTable('❓ PENDIENTES', pendingItems, '#64748b', 'PENDING')}
        
        <div style="margin-top: 40px; border-top: 1px solid #000; width: 200px; padding-top: 5px; text-align: center;">
            Firma Auditor
        </div>

        <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
  
  printWindow.document.write(contentAudit);
  printWindow.document.close();
};
