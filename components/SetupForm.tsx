
import React, { useState } from 'react';
import { STICKER_STYLES, STICKER_COUNTS } from '../constants';
import { StickerCount, StickerPlanItem } from '../types';
import { resizeImageFile } from '../utils/imageProcessing';
import { Upload, Sparkles, Play, Edit2, Image as ImageIcon, Languages, AlertTriangle, Eye, RefreshCw, X } from 'lucide-react';

interface Props {
  onGeneratePlan: (
    file: string | null, 
    styleId: string, 
    count: StickerCount, 
    context: string
  ) => void;
  onUpdatePlan: (plan: StickerPlanItem[]) => void;
  onStartGeneration: () => void;
  onTestGeneration: (file: string | null, styleId: string) => Promise<string | null | undefined>;
  isThinking: boolean;
  plan: StickerPlanItem[];
}

const SetupForm: React.FC<Props> = ({ 
  onGeneratePlan, 
  onUpdatePlan,
  onStartGeneration,
  onTestGeneration,
  isThinking, 
  plan 
}) => {
  const [file, setFile] = useState<string | null>(null);
  const [styleId, setStyleId] = useState(STICKER_STYLES[0].id);
  const [count, setCount] = useState<StickerCount>(8);
  const [context, setContext] = useState('');
  
  // Test Preview State
  const [testImage, setTestImage] = useState<string | null>(null);
  const [isTestLoading, setIsTestLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const originalFile = e.target.files[0];
      try {
        // Resize image to prevent "Payload Too Large" errors
        const resizedBase64 = await resizeImageFile(originalFile);
        setFile(resizedBase64);
      } catch (err) {
        console.error("Image resize failed", err);
        alert("圖片處理失敗，請試著換一張照片");
      }
    }
  };

  const handleTextChange = (id: number, newText: string) => {
    const updated = plan.map(item => 
      item.id === id ? { ...item, text: newText } : item
    );
    onUpdatePlan(updated);
  };

  const handleGenerateClick = () => {
    onGeneratePlan(file, styleId, count, context);
  };

  const handleLanguageSwitch = (lang: 'tc' | 'en' | 'both') => {
    if (plan.length === 0) return;
    const updated = plan.map(item => ({
      ...item,
      text: lang === 'tc' 
        ? item.originalTc 
        : lang === 'en' 
          ? item.originalEn 
          : `${item.originalTc} (${item.originalEn})`
    }));
    onUpdatePlan(updated);
  };

  const handleTestClick = async () => {
    if (!file) {
      alert("請先上傳參考照片");
      return;
    }
    setIsTestLoading(true);
    // Don't clear image immediately if refreshing, so user sees something while waiting
    if (!testImage) setTestImage(null); 
    
    const result = await onTestGeneration(file, styleId);
    if (result) {
      setTestImage(result);
    }
    setIsTestLoading(false);
  };

  // Duplicate Check
  const findDuplicates = () => {
    const counts: {[key:string]: number} = {};
    const duplicates: string[] = [];
    plan.forEach(item => {
      const t = item.text.trim();
      counts[t] = (counts[t] || 0) + 1;
    });
    for (const t in counts) {
      if (counts[t] > 1) duplicates.push(t);
    }
    return duplicates;
  };
  
  const duplicateTexts = findDuplicates();
  const hasPlan = plan.length > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      
      {/* LEFT COLUMN: Controls (35%) */}
      <div className="lg:w-[35%] space-y-4">
        <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-100">
          <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Edit2 size={18} className="text-indigo-600" />
            1. 設定參數
          </h2>

          {/* New Layout: Row with Upload(Left) and Options(Right) */}
          <div className="flex flex-row gap-4 mb-5">
            
            {/* 1. Upload Box (Vertical) */}
            <div className="w-1/3 min-w-[100px]">
              <label className="block text-xs font-bold text-slate-500 mb-1">參考照片</label>
              <label className="cursor-pointer border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition flex flex-col items-center justify-center aspect-[3/4] overflow-hidden relative group bg-slate-50 w-full">
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {file ? (
                  <>
                    <img src={file} alt="Preview" className="w-full h-full object-cover opacity-90" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 group-hover:opacity-100 transition">
                       <Upload size={24} />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-slate-400 p-2 text-center">
                    <Upload size={24} className="mb-2" />
                    <span className="text-[10px] leading-tight">上傳<br/>照片</span>
                  </div>
                )}
              </label>
            </div>

            {/* 2. Options (Count & Context) - Stacked Vertically */}
            <div className="flex-1 flex flex-col gap-3">
              <div>
                 <label className="block text-xs font-bold text-slate-500 mb-1">貼圖數量</label>
                 <div className="grid grid-cols-2 gap-2">
                   {STICKER_COUNTS.map((c) => (
                     <button
                       key={c}
                       onClick={() => setCount(c as StickerCount)}
                       className={`py-1.5 rounded-md text-xs font-bold transition ${
                         count === c 
                         ? 'bg-indigo-600 text-white shadow-sm' 
                         : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                       }`}
                     >
                       {c}張
                     </button>
                   ))}
                 </div>
              </div>
              
              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-bold text-slate-500 mb-1">情境 (選填)</label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="例：厭世上班族、熱戀情侶..."
                  className="w-full h-full min-h-[60px] px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none resize-none bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Style Grid (Icons) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">畫風選擇</label>
            <div className="grid grid-cols-4 gap-2">
              {STICKER_STYLES.map((style) => {
                 const Icon = style.icon;
                 return (
                  <button
                    key={style.id}
                    onClick={() => setStyleId(style.id)}
                    className={`relative flex flex-col items-center p-2 rounded-xl border transition-all ${
                      styleId === style.id
                      ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                      : 'border-slate-100 hover:border-indigo-200 bg-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full mb-1 flex items-center justify-center ${style.previewColor}`}>
                       <Icon size={18} />
                    </div>
                    <span className={`text-[10px] font-bold truncate w-full text-center ${styleId === style.id ? 'text-indigo-700' : 'text-slate-500'}`}>
                      {style.name}
                    </span>
                  </button>
                );
              })}
            </div>
            
             {/* Test Preview Button */}
            <div className="mt-3">
              {isTestLoading ? (
                 <div className="w-full py-2 bg-slate-100 rounded-lg flex items-center justify-center gap-2 text-xs text-slate-500 animate-pulse">
                   <Sparkles size={14} className="animate-spin" /> 繪製試看圖中...
                 </div>
              ) : testImage ? (
                 <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-indigo-100 shadow-sm bg-slate-50 group">
                    <img src={testImage} className="w-full h-full object-contain" alt="Preview" />
                    
                    {/* Close Button */}
                    <button 
                      onClick={() => setTestImage(null)}
                      className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm transition"
                      title="關閉預覽"
                    >
                      <X size={14} />
                    </button>

                    {/* Refresh Button */}
                    <button 
                      onClick={handleTestClick}
                      className="absolute bottom-2 right-2 bg-white/95 px-2 py-1.5 rounded-full shadow-md text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
                      title="使用目前選擇的風格重畫"
                    >
                      <RefreshCw size={12} />
                      <span className="text-[10px] font-bold hidden group-hover:inline">重畫</span>
                    </button>
                    
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full shadow-sm">
                      預覽結果
                    </div>
                 </div>
              ) : (
                <button 
                  onClick={handleTestClick}
                  disabled={!file}
                  className={`w-full py-2 border border-dashed border-indigo-300 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-1 ${!file ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Eye size={14} />
                  ✨ 試畫一張 (預覽風格)
                </button>
              )}
            </div>
          </div>

          {/* ACTION BUTTON 1: Generate Text */}
          <div className="mt-6">
            <button
              onClick={handleGenerateClick}
              disabled={isThinking}
              className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
                isThinking
                ? 'bg-slate-400 text-white cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
              }`}
            >
              {isThinking ? (
                <>
                  <Sparkles className="animate-spin" size={16} />
                  AI 構思中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  {hasPlan ? '重新產生文字' : '產生文字草稿'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Text & Preview (65%) */}
      <div className="lg:flex-1 flex flex-col h-full">
        <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-100 flex-1 flex flex-col min-h-[500px]">
          <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ImageIcon size={18} className="text-pink-500" />
            2. 文字草稿與生成
          </h2>

          {!hasPlan ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
              <Sparkles size={48} className="mb-3 text-indigo-200" />
              <p className="font-medium">請先在左側設定並點擊「產生文字草稿」</p>
              <p className="text-xs mt-1">AI 將為您規劃 {count} 組貼圖內容</p>
            </div>
          ) : (
            <>
              {/* DUPLICATE WARNING */}
              {duplicateTexts.length > 0 && (
                <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                   <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                   <div className="text-xs text-amber-800">
                      <span className="font-bold">注意：偵測到重複的文字</span>
                      <p className="mt-1 opacity-80">以下文字出現多次：{duplicateTexts.join(', ')}。建議修改以避免貼圖重複。</p>
                   </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 overflow-y-auto max-h-[600px] p-1">
                {plan.map((item) => {
                  // Highlight if duplicate
                  const isDuplicate = duplicateTexts.includes(item.text.trim());
                  
                  return (
                    <div key={item.id} className="relative group">
                      <span className={`absolute left-3 top-3 text-[10px] font-bold ${isDuplicate ? 'text-amber-500' : 'text-slate-400'}`}>
                        #{item.id + 1}
                      </span>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => handleTextChange(item.id, e.target.value)}
                        className={`w-full pl-10 pr-3 py-3 rounded-xl border bg-slate-50 focus:bg-white outline-none transition font-medium text-slate-700 text-sm ${
                          isDuplicate 
                          ? 'border-amber-300 ring-1 ring-amber-100' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* ACTION BUTTON 2: Start Drawing & Lang Toggle */}
              <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                
                {/* Language Toggles */}
                <div className="flex gap-2 sm:w-auto w-full">
                  <button 
                    onClick={() => handleLanguageSwitch('tc')}
                    className="flex-1 sm:flex-none px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 hover:text-indigo-600 transition flex items-center justify-center gap-1"
                    title="切換為僅繁體中文"
                  >
                    <Languages size={14} />
                    僅繁中
                  </button>
                  <button 
                    onClick={() => handleLanguageSwitch('en')}
                    className="flex-1 sm:flex-none px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 hover:text-indigo-600 transition flex items-center justify-center gap-1"
                    title="Switch to English Only"
                  >
                    <Languages size={14} />
                    僅英文
                  </button>
                </div>

                {/* Main Button */}
                <button
                  onClick={onStartGeneration}
                  className="flex-1 py-3 rounded-xl font-bold text-lg shadow-xl text-white bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 transition transform active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <Play fill="currentColor" size={20} />
                  開始繪製
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default SetupForm;
