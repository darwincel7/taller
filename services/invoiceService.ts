
import { RepairOrder, OrderStatus, OrderType, Payment, InventoryPart } from '../types';

const openPrintWindow = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor permite ventanas emergentes para imprimir la factura.");
        return null;
    }
    printWindow.document.open();
    return printWindow;
};

export const printInventoryLabel = (part: InventoryPart) => {
  const printWindow = openPrintWindow();
  if (!printWindow) return;

  const sku = part.id.slice(0, 8).toUpperCase();
  
  const qrData = JSON.stringify({
      id: part.id,
      name: part.name,
      price: part.price
  });
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrData)}`;

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
            padding: 2px; 
            width: 48mm; 
            height: 28mm;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            overflow: hidden;
        }
        * { font-weight: 900 !important; }
        .info { flex: 1; padding-right: 2px; display: flex; flex-direction: column; justify-content: center; }
        .sku-box { 
            font-size: 10px; 
            border: 1px solid #000; 
            border-radius: 4px;
            padding: 1px 3px;
            width: fit-content;
            margin-bottom: 2px;
            font-family: monospace;
        }
        .name { 
            font-size: 11px; 
            line-height: 1.1; 
            margin-bottom: 2px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .price { font-size: 14px; }
        .qr { width: 22mm; height: 22mm; }
      </style>
    </head>
    <body>
      <div class="info">
        <span class="sku-box">SKU: ${sku}</span>
        <span class="name">${part.name}</span>
        <span class="price">$${part.price.toLocaleString()}</span>
      </div>
      <img class="qr" src="${qrUrl}" />
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
  printWindow.document.write(content);
  printWindow.document.close();
};

export const printSticker = (order: RepairOrder) => {
  const printWindow = openPrintWindow();
  if (!printWindow) return;

  let baseUrl = window.location.origin;
  const storedOrigin = localStorage.getItem('darwin_server_origin');
  if (storedOrigin) {
      baseUrl = storedOrigin.replace(/\/$/, "");
  }

  const appLink = `${baseUrl}/#/orders/${order.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(appLink)}`;
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;

  // LOGIC FOR LABELS
  let typeLabel = "CLIENTE";
  let infoLabel = "FALLA:";
  let infoValue = order.deviceIssue;
  let moneyLabel = "A COBRAR:";
  let moneyValue = `$${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}`;

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
            padding: 0 2px; /* Minimal side padding */
            width: 46mm; 
            height: 28mm; 
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center; /* Center the compact block vertically */
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
        
        .qr-col { width: 13mm; display: flex; align-items: center; justify-content: center; }
        .qr-img { width: 12mm; height: 12mm; }

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
        <div class="qr-col">
            <img class="qr-img" src="${qrUrl}" />
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
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
};

export const printTransferManifest = (order: RepairOrder, fromBranch: string, toBranch: string) => {
  const printWindow = openPrintWindow();
  if (!printWindow) return;

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
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
};

export const printCashCount = (payments: Payment[], cashierName: string, totals: { cash: number, transfer: number, card: number, credit: number, total: number }) => {
  const printWindow = openPrintWindow();
  if (!printWindow) return;

  const dateValue = new Date().toLocaleString('es-ES');

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>CORTE DE CAJA</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: 'Courier New', monospace; margin: 0; padding: 5px; width: 72mm; font-size: 11px; }
        * { font-weight: bold !important; }
        .center { text-align: center; }
        .header { margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 5px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .section { margin-top: 10px; border-top: 2px dashed #000; padding-top: 5px; margin-bottom: 5px; }
        .highlight { font-size: 13px; }
        .method-box { border: 2px solid #000; padding: 3px; margin-bottom: 2px; }
        .cashier-info { font-size: 10px; margin-bottom: 10px; }
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
      
      <div class="section row" style="font-size: 16px; border-top: 2px solid #000; padding-top: 8px;">
        <span>TOTAL TURNO:</span>
        <span>$${totals.total.toLocaleString()}</span>
      </div>

      <div class="section">DETALLE DE MOVIMIENTOS:</div>
      ${payments.map(p => `
        <div style="margin-bottom: 3px; border-bottom: 1px dotted #000; padding-bottom: 2px;">
            <div class="row" style="font-size: 10px; margin-bottom: 0;">
                <span>#${typeof p.orderId === 'string' ? p.orderId.slice(-4) : '---'} (${p.method.substring(0,3)})</span>
                <span>$${p.amount.toLocaleString()}</span>
            </div>
            ${p.orderModel ? `<div style="font-size: 9px;">${p.orderModel.substring(0,25)}</div>` : ''}
        </div>
      `).join('')}

      <div class="center" style="margin-top: 30px; font-size: 10px;">
        _____________________<br/>
        Firma Responsable
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
  printWindow.document.write(content);
  printWindow.document.close();
};

// FIX: Accept optional targetWindow to allow pre-opening windows to bypass blockers
export const printInvoice = (order: RepairOrder, targetWindow?: Window | null) => {
  let printWindow = targetWindow;
  
  if (!printWindow) {
      printWindow = window.open('', '_blank');
  }

  if (!printWindow) {
      alert("Por favor permite ventanas emergentes para imprimir la factura.");
      return;
  }

  // Ensure document is open for writing
  printWindow.document.open();

  const isFinal = order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED;
  // LOGIC FOR RETURNS
  const isReturn = order.returnRequest?.status === 'APPROVED' || (order.isRepairSuccessful === false && isFinal);
  
  let docTitle = isFinal ? "FACTURA FINAL" : "RECIBO DE INGRESO";
  if (isReturn) docTitle = "COMPROBANTE DE DEVOLUCIÓN";

  const dateValue = new Date().toLocaleString('es-ES');
  
  const displayId = order.readable_id ? `#${order.readable_id}` : `#${order.id.slice(-6)}`;

  // --- STANDARD CLIENT INVOICE ---
  let paymentsHtml = '';
  if (order.payments && order.payments.length > 0) {
      paymentsHtml = `
      <div class="dashed-line"></div>
      <div style="margin-top: 5px;">PAGOS REALIZADOS:</div>
      ${order.payments.map(p => `
          <div class="row">
              <span>${p.method} ${p.isRefund ? '(DEV.)' : ''}</span>
              <span>$${p.amount.toFixed(2)}</span>
          </div>
      `).join('')}
      `;
  }

  const content = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${docTitle} ${displayId}</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { 
            font-family: 'Courier New', monospace; 
            margin: 0; 
            padding: 5px; 
            width: 78mm; 
            font-size: 11px; 
            color: #000;
            background: #fff;
        }
        * { font-weight: bold !important; }
        .center { text-align: center; }
        .header { margin-bottom: 10px; }
        .logo { font-size: 16px; text-transform: uppercase; }
        .info { font-size: 10px; margin-bottom: 3px; }
        .dashed-line { border-top: 2px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .total-box { margin-top: 10px; font-size: 16px; text-align: right; border-top: 2px solid #000; padding-top: 5px;}
        .terms { font-size: 9px; text-align: justify; margin-top: 15px; line-height: 1.2; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; }
        .big-id { font-size: 32px; border: 3px solid #000; padding: 5px 10px; margin: 10px 0; display: inline-block; }
        .return-warning { margin: 10px 0; border: 1px solid #000; padding: 5px; text-align: center; font-size: 10px; }
      </style>
    </head>
    <body>
      <div class="header center">
        <div class="logo">Darwin's Taller</div>
        <div class="info">RNC: 000-00000-0</div>
        <div class="info">Tel: (849) 506-8007</div>
        <div class="info">${order.currentBranch || 'Sucursal Principal'}</div>
      </div>

      <div class="center" style="font-size: 12px; margin-bottom: 5px;">${docTitle}</div>
      <div class="center"><span class="big-id">${displayId}</span></div>
      <div class="center info">${dateValue}</div>

      <div class="dashed-line"></div>

      <div class="row"><span>Cliente:</span> <span>${order.customer.name.substring(0, 18)}</span></div>
      <div class="row"><span>Tel:</span> <span>${order.customer.phone}</span></div>
      <div class="dashed-line"></div>
      
      <div>EQUIPO:</div>
      <div style="font-size:12px">${order.deviceModel}</div>
      ${order.imei ? `<div>IMEI: ${order.imei}</div>` : ''}
      <div style="margin-top:5px"><span>Falla:</span> ${order.deviceIssue}</div>
      
      ${isReturn ? `
        <div class="return-warning">
            EQUIPO DEVUELTO SIN REPARAR.<br/>
            EL MONTO COBRADO CORRESPONDE A CHEQUEO TÉCNICO, USO DE MAQUINARIA Y DIAGNÓSTICO.
        </div>
      ` : ''}

      <div class="dashed-line"></div>

      ${isFinal ? 
        `<div class="row"><span>SERVICIO</span> <span>VALOR</span></div>
         <div class="row">
            <span>${isReturn ? 'Costo Chequeo/Diagnóstico' : 'Reparación/Servicio'}</span>
            <span>$${(order.finalPrice || 0).toFixed(2)}</span>
         </div>` 
        : 
        `<div class="row"><span>PRECIO ESTIMADO:</span> <span>$${(order.estimatedCost || 0).toFixed(2)}</span></div>
         <div style="font-size:9px; font-style:italic; margin-top:2px;">* Sujeto a revisión técnica final.</div>`
      }

      ${isFinal ? 
        `<div class="total-box">TOTAL: $${(order.finalPrice || 0).toFixed(2)}</div>` 
        : ''
      }

      ${paymentsHtml}

      <div class="dashed-line"></div>
      
      <div class="terms">
        <div style="margin-bottom:2px;">TÉRMINOS Y GARANTÍA:</div>
        1. Pantallas GENÉRICAS NO tienen garantía.<br/>
        2. Pantallas ORIGINALES tienen 15 días de prueba.<br/>
        3. No cubrimos daños por agua o golpes post-entrega.<br/>
        4. Equipos no retirados en 90 días pasan a reciclaje.<br/>
        5. Al firmar acepta estos términos.
      </div>

      <div class="center" style="margin-top: 25px;">
        __________________________<br/>
        Firma Cliente
      </div>
      
      <div class="footer">
        ¡Gracias por su preferencia!
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
};

export const printAuditReport = (report: any) => {
  const printWindow = openPrintWindow();
  if (!printWindow) return;
  
  const discrepancies = report.discrepancies || [];
  const missingItems = discrepancies.filter((d: any) => d.status === 'MISSING' || (!d.status && !d.resolved));
  const reviewItems = discrepancies.filter((d: any) => d.status === 'REVIEW' || d.status === 'PENDING');
  const foundItems = discrepancies.filter((d: any) => d.status === 'FOUND' || d.resolved);
  
  const renderTable = (title: string, items: any[], color: string) => {
      if (items.length === 0) return '';
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
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
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
        </div>
        
        ${renderTable('⚠️ EQUIPOS FALTANTES', missingItems, '#ef4444')}
        ${renderTable('🟠 EQUIPOS EN REVISIÓN', reviewItems, '#f97316')}
        ${renderTable('✅ EQUIPOS ENCONTRADOS', foundItems, '#22c55e')}
        
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
