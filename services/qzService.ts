import qz from 'qz-tray';

let connectionPromise: Promise<void> | null = null;

export const connectQZ = (retryCount = 0): Promise<void> => {
  // If already connected, return immediately
  if (qz.websocket.isActive()) {
    return Promise.resolve();
  }

  // Set up QZ Tray security
  qz.security.setCertificatePromise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch("/api/cert-qz", { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Failed to fetch certificate");
        return res.text();
      })
      .then(resolve)
      .catch(err => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });

  qz.security.setSignatureAlgorithm("SHA256");
  qz.security.setSignaturePromise((toSign) => {
    return (resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      fetch("/api/sign-qz", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: toSign }),
        signal: controller.signal
      })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Failed to sign request");
        return res.text();
      })
      .then(resolve)
      .catch(err => {
        clearTimeout(timeoutId);
        reject(err);
      });
    };
  });

  // If a connection attempt is already in progress, return that promise
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      connectionPromise = null;
      // Many users do not have QZ tray installed. Downgrade from Error to standard console log if it times out
      // so it doesn't spray red error toasts constantly.
      reject(new Error("QZ_TRAY_TIMEOUT"));
    }, 10000);

    qz.websocket.connect({
      host: ['localhost', 'localhost.qz.io', '127.0.0.1'],
      retries: 0,
      delay: 1,
      keepAlive: 60
    }).then(() => {
      clearTimeout(timeoutId);
      connectionPromise = null;
      resolve();
    }).catch((err: any) => {
      clearTimeout(timeoutId);
      connectionPromise = null;
      
      let errMsg = "";
      if (typeof err === 'string') errMsg = err;
      else if (err instanceof Error) errMsg = err.message;
      else if (err && err.message) errMsg = err.message;
      else errMsg = JSON.stringify(err);
      
      // Ignore user cancellation
      if (errMsg.includes("Connection attempt cancelled by user") || String(err).includes("Connection attempt cancelled by user")) {
        console.warn("QZ Tray connection cancelled by user.");
        reject(err);
        return;
      }

      // If it's a websocket connection error, it just means they don't have the app open or installed.
      if (errMsg.includes("could not connect") || errMsg.includes("WebSocket connection") || errMsg.includes("websocket")) {
        reject(new Error("QZ_TRAY_NOT_RUNNING"));
        return;
      }
      
      console.warn("Warn: QZ Tray not responding or not running:", errMsg);
      
      // If the connection was closed prematurely, retry after a short delay
      if (errMsg.includes("Connection closed before response") && retryCount < 2) {
        setTimeout(() => {
          connectQZ(retryCount + 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });
  });

  return connectionPromise;
};

export const forceReconnect = async (): Promise<void> => {
  try {
    if (qz.websocket.isActive()) {
      try {
        await qz.websocket.disconnect();
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        if (errMsg.includes("Waiting for previous disconnect request to complete")) {
          console.warn("QZ Tray is already disconnecting, waiting...");
          // Wait a bit for the previous disconnect to finish
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          console.warn("QZ Tray disconnect error ignored:", errMsg);
        }
      }
    }
  } catch (e: any) {
    console.warn("QZ Tray disconnect error ignored:", e?.message || e);
  }
  
  // Ensure we wait a moment before reconnecting if it was just active
  await new Promise(resolve => setTimeout(resolve, 500));
  
  connectionPromise = null;
  await connectQZ();
};

export const getPrinters = async (retry = true): Promise<string[]> => {
  await connectQZ();
  try {
    return await qz.printers.find();
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (retry && errMsg.includes('sendData is not a function')) {
      console.warn("QZ Tray connection corrupted. Forcing reconnect...");
      await forceReconnect();
      return await qz.printers.find();
    }
    throw err;
  }
};

export const printHtmlToPrinter = async (
  printerName: string,
  htmlContent: string,
  options?: { width?: number; height?: number },
  retry = true
) => {
  await connectQZ();

  const config = qz.configs.create(printerName, {
    size: options ? { width: options.width, height: options.height } : undefined,
    units: 'mm',
    margins: 0,
    colorType: 'blackwhite',
    density: 203,
    rasterize: false
  });

  const data = [{
    type: 'pixel',
    format: 'html',
    flavor: 'plain',
    data: htmlContent
  }];

  try {
    const printPromise = qz.print(config, data);
    const timeoutPromise = new Promise<any>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT_SPOOLER")), 30000);
    });
    
    return await Promise.race([printPromise, timeoutPromise]);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg === "TIMEOUT_SPOOLER") {
      throw new Error("El sistema de impresión tardó demasiado en responder. Si el problema persiste, asegúrate de que la impresora esté encendida, conectada y que no haya trabajos de impresión atascados en la cola del sistema (CUPS en macOS).");
    }
    if (retry && errMsg.includes('sendData is not a function')) {
      console.warn("QZ Tray connection corrupted. Forcing reconnect...");
      await forceReconnect();
      return await qz.print(config, data);
    }
    throw err;
  }
};

export const printImageToPrinter = async (
  printerName: string,
  base64Image: string,
  options?: { width?: number; height?: number },
  retry = true
) => {
  await connectQZ();

  const config = qz.configs.create(printerName, {
    size: options ? { width: options.width, height: options.height } : undefined,
    units: 'mm',
    margins: 0,
    density: 203, // Standard for most label printers (Zebra, etc.)
    interpolation: false, // Disable smoothing for maximum sharpness
    rasterize: true
  });

  // Extract base64 data without the data URI prefix
  const base64Data = base64Image.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

  const data = [{
    type: 'pixel',
    format: 'image',
    flavor: 'base64',
    data: base64Data
  }];

  try {
    // Add a 30-second timeout to prevent infinite hanging if the Windows spooler is stuck
    const printPromise = qz.print(config, data);
    const timeoutPromise = new Promise<any>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT_SPOOLER")), 30000);
    });
    
    return await Promise.race([printPromise, timeoutPromise]);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg === "TIMEOUT_SPOOLER") {
      throw new Error("El sistema de impresión tardó demasiado en responder. Si el problema persiste, asegúrate de que la impresora esté encendida, conectada y que no haya trabajos de impresión atascados en la cola del sistema (CUPS en macOS).");
    }
    if (retry && errMsg.includes('sendData is not a function')) {
      console.warn("QZ Tray connection corrupted. Forcing reconnect...");
      await forceReconnect();
      return await qz.print(config, data);
    }
    throw err;
  }
};

export const printRawEscPos = async (
  printerName: string,
  commands: string[],
  retry = true
) => {
  await connectQZ();

  const config = qz.configs.create(printerName, { encoding: 'ISO-8859-1' });

  try {
    const printPromise = qz.print(config, commands);
    const timeoutPromise = new Promise<any>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT_SPOOLER")), 30000);
    });
    
    return await Promise.race([printPromise, timeoutPromise]);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg === "TIMEOUT_SPOOLER") {
      throw new Error("El sistema de impresión tardó demasiado en responder. Si el problema persiste, asegúrate de que la impresora esté encendida, conectada y que no haya trabajos de impresión atascados en la cola del sistema (CUPS en macOS).");
    }
    if (retry && errMsg.includes('sendData is not a function')) {
      console.warn("QZ Tray connection corrupted. Forcing reconnect...");
      await forceReconnect();
      return await qz.print(config, commands);
    }
    throw err;
  }
};
