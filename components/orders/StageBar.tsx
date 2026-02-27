
import React from 'react';
import { StatusTimeline } from '../StatusTimeline';
import { OrderStatus } from '../../types';

interface StageBarProps {
  currentStatus: OrderStatus;
  onStepClick: (status: OrderStatus) => void;
  disabled: boolean;
}

export const StageBar: React.FC<StageBarProps> = ({ currentStatus, onStepClick, disabled }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-x-auto">
      <StatusTimeline 
        currentStatus={currentStatus} 
        onStepClick={onStepClick} 
        disabled={disabled} 
      />
    </div>
  );
};
