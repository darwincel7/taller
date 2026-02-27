import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const FloatingBackButtonComponent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on Dashboard (Home) or Login
  if (location.pathname === '/' || location.pathname === '/login') return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed bottom-6 left-6 z-40 bg-slate-800 text-white p-4 rounded-full shadow-lg hover:bg-slate-700 transition-all hover:scale-110 flex items-center justify-center border-2 border-slate-600"
      title="Volver atrás"
    >
      <ArrowLeft className="w-6 h-6" />
    </button>
  );
};

export const FloatingBackButton = FloatingBackButtonComponent;