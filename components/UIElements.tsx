
import React from 'react';
import { Attribute, ATTRIBUTE_LABELS } from '../types';

export const ProgressBar = ({ current, max, color = "bg-blue-500" }: { current: number; max: number; color?: string }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="w-full bg-slate-950 rounded-full h-4 overflow-hidden border border-slate-800 shadow-inner">
      <div
        className={`h-full ${color} transition-all duration-1000 ease-out flex items-center justify-end pr-1`}
        style={{ width: `${percentage}%` }}
      >
        <div className="w-full h-full bg-white/20 animate-pulse"></div>
      </div>
    </div>
  );
};

export const Modal = ({ isOpen, onClose, title, children, large = false }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode; large?: boolean }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-xl w-full ${large ? 'max-w-2xl' : 'max-w-md'} shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto`}>
        <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 sticky top-0 z-10">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export const RadarChart = ({ attributes }: { attributes: Record<Attribute, number> }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40;
  const attributeKeys: Attribute[] = ['STR', 'AGI', 'DEX', 'DRV', 'INT', 'CHA', 'VIG', 'END'];
  const values = attributeKeys.map(k => attributes[k] || 0);
  const maxVal = Math.max(20, ...values);

  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / attributeKeys.length - Math.PI / 2;
    const r = (value / maxVal) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const points = attributeKeys.map((key, i) => {
    const { x, y } = getCoordinates(i, attributes[key] || 0);
    return `${x},${y}`;
  }).join(" ");

  const backgroundPoints = attributeKeys.map((_, i) => {
    const { x, y } = getCoordinates(i, maxVal);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="relative flex justify-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        <polygon points={backgroundPoints} fill="rgba(30, 41, 59, 0.5)" stroke="#334155" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((scale) => (
             <polygon key={scale} points={attributeKeys.map((_, i) => {
                    const { x, y } = getCoordinates(i, maxVal * scale);
                    return `${x},${y}`;
                }).join(" ")} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        <polygon points={points} fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" strokeWidth="2" />
        {attributeKeys.map((key, i) => {
            const { x, y } = getCoordinates(i, attributes[key] || 0);
            return <circle key={i} cx={x} cy={y} r="3" fill="#34d399" />;
        })}
        {attributeKeys.map((key, i) => {
          const { x, y } = getCoordinates(i, maxVal + (maxVal * 0.18)); 
          return (
            <g key={i}>
                <text x={x} y={y - 5} textAnchor="middle" className="text-[10px] fill-slate-300 font-bold uppercase">{ATTRIBUTE_LABELS[key]}</text>
                <text x={x} y={y + 8} textAnchor="middle" className="text-[9px] fill-emerald-400 font-bold">{Math.floor(attributes[key] || 0)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
