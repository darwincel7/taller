import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auditService } from '../services/auditService';

export const GlobalClickTracker: React.FC = () => {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    const handleClick = (e: MouseEvent) => {
      // Find the closest element with a data-track-action attribute
      const target = e.target as HTMLElement;
      const trackableElement = target.closest('[data-track-action]');
      
      if (trackableElement) {
        const action = trackableElement.getAttribute('data-track-action');
        const entityId = trackableElement.getAttribute('data-track-id') || undefined;
        const entityType = trackableElement.getAttribute('data-track-type') as any || 'SYSTEM';
        const details = trackableElement.getAttribute('data-track-details') || `Hizo clic en ${action}`;
        
        // Optional: Extract metadata if provided as JSON string
        let metadata = null;
        const metaString = trackableElement.getAttribute('data-track-meta');
        if (metaString) {
          try {
            metadata = JSON.parse(metaString);
          } catch (e) {
            console.warn('Invalid JSON in data-track-meta', metaString);
          }
        }

        if (action) {
          // Send tracking event asynchronously
          auditService.recordLog(
            currentUser,
            action,
            details,
            entityType === 'ORDER' ? entityId : undefined,
            entityType,
            entityId,
            metadata
          ).catch(console.warn);
        }
      }
    };

    // Use capture phase to ensure we catch it before React stops propagation in some cases
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [currentUser]);

  return null; // This is a logic-only component
};
