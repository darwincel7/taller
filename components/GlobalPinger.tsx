import React, { useEffect } from 'react';

export const GlobalPinger: React.FC = () => {
  useEffect(() => {
    // Ping the backend every 3 minutes to keep the container awake
    // and prevent WhatsApp connection from dropping due to CPU throttling
    const interval = setInterval(() => {
      fetch('/api/whatsapp/status').catch(() => {});
    }, 180000);
    
    return () => clearInterval(interval);
  }, []);

  return null;
};
