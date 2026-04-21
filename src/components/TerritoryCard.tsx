import React from 'react';
import { motion } from 'motion/react';
import { X, Printer, Download } from 'lucide-react';
import { Territory, Point } from '../types';

interface TerritoryCardProps {
  territory: Territory;
  onClose: () => void;
}

export const TerritoryCard: React.FC<TerritoryCardProps> = ({ territory, onClose }) => {
  // Calculate SVG viewBox and points
  const points = territory.points;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const padding = 0.001; // Small geographic padding
  const width = (maxLng - minLng) + (padding * 2);
  const height = (maxLat - minLat) + (padding * 2);
  
  // Normalize points to local SVG coordinates (0 to 100)
  const svgWidth = 400;
  const svgHeight = 300;
  
  const normalizedPoints = points.map(p => ({
    x: ((p.lng - (minLng - padding)) / width) * svgWidth,
    y: svgHeight - (((p.lat - (minLat - padding)) / height) * svgHeight) // SVG y is top-down
  }));

  const pointsString = normalizedPoints.map(p => `${p.x},${p.y}`).join(' ');

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative bg-[#f5f2ed] w-full max-w-2xl shadow-2xl rounded-sm overflow-hidden flex flex-col print:shadow-none print:rounded-none print:w-full print:max-w-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar - Hidden when printing */}
        <div className="absolute top-4 right-4 flex gap-2 print:hidden z-10">
          <button
            onClick={handlePrint}
            className="p-2 bg-white/80 hover:bg-white rounded-full text-gray-700 shadow-sm transition-all"
            title="Print Card"
          >
            <Printer size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-white/80 hover:bg-white rounded-full text-gray-700 shadow-sm transition-all"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Card Content */}
        <div className="p-6 sm:p-12 space-y-4 sm:space-y-8 text-black font-serif print:p-8">
          {/* Header */}
          <div className="text-center border-b-2 border-black pb-2 sm:pb-4">
            <h1 className="text-xl sm:text-3xl font-bold uppercase tracking-widest">Cartão de Mapa de Território</h1>
          </div>

          {/* Details Row */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-2 sm:gap-4 text-base sm:text-lg">
            <div className="flex-1 flex items-end gap-2">
              <span className="whitespace-nowrap font-bold">Localidade</span>
              <div className="flex-1 border-b border-black border-dotted h-6 mb-1">
                <span className="px-2 italic font-sans text-sm sm:text-base">{territory.name}</span>
              </div>
            </div>
            <div className="w-full sm:w-48 flex items-end gap-2">
              <span className="whitespace-nowrap font-bold">Terr. N°</span>
              <div className="flex-1 border-b border-black border-dotted h-6 mb-1 flex justify-center">
                <span className="text-xl sm:text-2xl font-bold -mt-1 font-sans">{territory.number}</span>
              </div>
            </div>
          </div>

          {/* Map Area */}
          <div className="relative aspect-[4/3] bg-white border-2 border-black flex items-center justify-center p-8">
             {/* Simple SVG Polygon Visualization */}
             <svg 
               viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
               className="w-full h-full drop-shadow-md"
               preserveAspectRatio="xMidYMid meet"
             >
               <polygon
                 points={pointsString}
                 fill="#fffca6"
                 stroke="black"
                 strokeWidth="2"
               />
               {/* Label N° in center of polygon */}
               <text
                 x={svgWidth/2}
                 y={svgHeight/2}
                 textAnchor="middle"
                 dominantBaseline="middle"
                 fontSize="24"
                 fontWeight="bold"
                 className="select-none pointer-events-none fill-black/30"
               >
                 N° {territory.number}
               </text>
             </svg>
             
             {/* Floating Street Name Labels placeholders like in the image */}
             <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs font-sans font-medium uppercase tracking-tighter opacity-70 bg-white/80 px-1">
               {territory.northBoundary || "Rua Norte"}
             </div>
             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-sans font-medium uppercase tracking-tighter opacity-70 bg-white/80 px-1">
               {territory.southBoundary || "Rua Sul"}
             </div>
             <div className="absolute left-4 top-1/2 -rotate-90 origin-center text-xs font-sans font-medium uppercase tracking-tighter opacity-70 bg-white/80 px-1 whitespace-nowrap">
               {territory.westBoundary || "Rua Oeste"}
             </div>
             <div className="absolute right-4 top-1/2 rotate-90 origin-center text-xs font-sans font-medium uppercase tracking-tighter opacity-70 bg-white/80 px-1 whitespace-nowrap">
               {territory.eastBoundary || "Rua Leste"}
             </div>
          </div>

          {/* Instructions / Info */}
          <div className="space-y-4">
            <div className="text-center text-sm italic opacity-80 mb-2">
              (Cole o mapa acima ou desenhe o território)
            </div>
            
            <div className="bg-white/50 p-4 border border-black/10 rounded-sm">
               <h3 className="text-xs uppercase font-bold mb-1 opacity-50 font-sans tracking-widest">Informações Complementares</h3>
               <p className="text-base italic min-h-[60px]">
                 {territory.info || "Nenhuma informação adicional salva para este território."}
               </p>
            </div>

            <div className="text-[13px] leading-relaxed text-justify space-y-2 opacity-90 border-t border-black/20 pt-4">
              <p>
                <b>Guarde este cartão no envelope.</b> Tome cuidado para não o manchar, marcar ou dobrar. Cada vez que o território for coberto, queira informar disso o irmão que cuida do arquivo de territórios.
              </p>
            </div>
          </div>

          {/* Footer Branding */}
          <div className="flex justify-between items-end pt-4 text-[10px] uppercase font-sans tracking-wider opacity-60">
            <div>S-12-T {new Date(territory.createdAt || '').toLocaleDateString('pt-BR')}</div>
            <div>Impresso no Brasil</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
