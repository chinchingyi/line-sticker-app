
import React from 'react';
import JSZip from 'jszip';
import { GeneratedSticker } from '../types';
import { downloadBlob, createResizedVariant } from '../utils/imageProcessing';
import { Download, Loader2, Image as ImageIcon, ArrowLeft, XCircle, Palette, RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  stickers: GeneratedSticker[];
  isGenerating: boolean;
  onReset: () => void;
  onCancel: () => void;
  onRegenerateSingle: (id: number) => void;
}

const ResultsGrid: React.FC<Props> = ({ 
  stickers, 
  isGenerating, 
  onReset, 
  onCancel,
  onRegenerateSingle
}) => {
  
  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("line_stickers");
    const successStickers = stickers.filter(s => s.status === 'success' && s.processedUrl);

    // 1. Add all stickers (320x320)
    successStickers.forEach((sticker) => {
      if (sticker.processedUrl) {
        const data = sticker.processedUrl.split(',')[1];
        folder?.file(`sticker_${sticker.id + 1}.png`, data, { base64: true });
      }
    });

    // 2. Generate LINE store requirements (main.png & tab.png) from the first sticker
    if (successStickers.length > 0) {
      const firstSticker = successStickers[0];
      try {
        const mainUrl = await createResizedVariant(firstSticker.processedUrl, 240, 240);
        folder?.file("main.png", mainUrl.split(',')[1], { base64: true });

        const tabUrl = await createResizedVariant(firstSticker.processedUrl, 96, 74);
        folder?.file("tab.png", tabUrl.split(',')[1], { base64: true });

      } catch (e) {
        console.error("Failed to create resized assets", e);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "line_stickers_pack.zip");
  };

  const completedCount = stickers.filter(s => s.status === 'success').length;
  const totalCount = stickers.length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      
      {/* Header / Status */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 sticky top-20 z-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <span className="w-3 h-8 bg-indigo-500 rounded-full inline-block"></span>
              {isGenerating ? '生成進行中' : '生成結果'}
            </h2>
            
            {isGenerating ? (
              <p className="text-indigo-600 text-sm mt-2 ml-5 flex items-center gap-2 font-medium animate-pulse">
                <Palette size={16} />
                AI 正在揮毫中... 請稍候，好圖值得等待！({completedCount}/{totalCount})
              </p>
            ) : (
              <p className="text-slate-500 text-sm mt-2 ml-5">
                生成完畢！共 {completedCount} 張貼圖
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
             {isGenerating ? (
                <div className="flex items-center gap-3 w-full bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="flex-1 md:w-48 bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${(completedCount / totalCount) * 100}%` }}
                    ></div>
                  </div>
                  <button
                   onClick={onCancel}
                   className="px-3 py-1.5 rounded-lg bg-white border border-red-100 text-red-500 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1 whitespace-nowrap shadow-sm"
                 >
                   <XCircle size={14} />
                   取消
                 </button>
                </div>
             ) : completedCount > 0 && (
               <>
                 <button
                   onClick={onReset}
                   className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold transition flex items-center gap-2"
                 >
                   <ArrowLeft size={18} />
                   重做一組
                 </button>
                 <button
                   onClick={handleDownloadAll}
                   className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition flex items-center gap-2"
                 >
                   <Download size={20} />
                   下載打包 (ZIP)
                 </button>
               </>
             )}
          </div>
        </div>
      </div>

      {/* Grid - Larger images (fewer columns) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {stickers.map((sticker) => (
          <div key={sticker.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative group hover:shadow-md transition">
            
            {/* Aspect Ratio Box 1:1 */}
            <div className="relative pt-[100%] bg-[url('https://media.istockphoto.com/id/1300305276/vector/transparent-background-grid-seamless-pattern-png-background.jpg?s=612x612&w=0&k=20&c=L_1D369w48bF2_rQhK6t_gW8J3v8C7bF5g4_e7f3_c=')] bg-cover">
              
              <div className="absolute inset-0 flex items-center justify-center p-2">
                {sticker.status === 'generating' && (
                  <div className="flex flex-col items-center text-indigo-500">
                    <Loader2 className="animate-spin mb-2" size={32} />
                    <span className="text-xs font-bold bg-white/90 px-3 py-1 rounded-full shadow-sm">繪製中...</span>
                  </div>
                )}
                
                {sticker.status === 'pending' && (
                  <div className="text-slate-300 flex flex-col items-center">
                    <ImageIcon size={32} className="mb-2 opacity-50" />
                    <span className="text-xs font-medium">等待中</span>
                  </div>
                )}

                {sticker.status === 'error' && (
                  <div className="flex flex-col items-center justify-center text-red-500 p-2 text-center h-full">
                     <AlertCircle size={24} className="mb-2" />
                     <div className="text-xs font-bold bg-red-50 px-3 py-1 rounded-full mb-1">
                        生成失敗
                     </div>
                     <p className="text-[10px] text-red-400 leading-tight max-w-[150px]">
                       {sticker.error || "未知錯誤"}
                     </p>
                  </div>
                )}

                {sticker.status === 'success' && sticker.processedUrl && (
                  <>
                    <img 
                      src={sticker.processedUrl} 
                      alt={sticker.text} 
                      className="w-full h-full object-contain drop-shadow-sm transform transition duration-300 group-hover:scale-105"
                    />
                    
                    {/* Regenerate Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                       <button
                         onClick={() => onRegenerateSingle(sticker.id)}
                         disabled={isGenerating}
                         className="bg-white text-slate-800 px-3 py-2 rounded-full font-bold text-xs shadow-lg hover:bg-indigo-50 hover:text-indigo-600 transition flex items-center gap-1 transform hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         <RefreshCw size={14} />
                         重繪此張
                       </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-slate-100 text-center">
              <p className="font-bold text-slate-800 text-sm truncate">{sticker.text}</p>
              {sticker.status === 'success' && (
                <div className="text-[10px] text-slate-400 mt-0.5">320 x 320 px</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResultsGrid;
