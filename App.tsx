
import { useState, useRef, useEffect } from 'react';
import SetupForm from './components/SetupForm';
import ResultsGrid from './components/ResultsGrid';
import { AppState, StickerPlanItem, StickerCount, GeneratedSticker } from './types';
import { generateStickerPlan, generateSingleStickerImage } from './services/geminiService';
import { processStickerImage } from './utils/imageProcessing';
import { STICKER_STYLES } from './constants';

const APP_VERSION = "v2.0.1";

const initialState: AppState = {
  step: 'setup',
  referenceImage: null,
  selectedStyleId: STICKER_STYLES[0].id,
  count: 8,
  usageContext: '',
  stickerPlan: [],
  results: [],
  isThinking: false, // Used for Text Planning
  progress: 0,
};

// Helper for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function App() {
  const [state, setState] = useState<AppState>(initialState);
  
  // Ref to handle cancellation of Image Generation
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // --- Actions ---

  // 1. Generate Text Plan
  const handleGeneratePlan = async (
    file: string | null,
    styleId: string,
    count: StickerCount,
    context: string
  ) => {
    setState(prev => ({ 
      ...prev, 
      isThinking: true,
      referenceImage: file,
      selectedStyleId: styleId,
      count,
      usageContext: context
    }));
    
    try {
      const plan = await generateStickerPlan(count, context);
      setState(prev => ({
        ...prev,
        stickerPlan: plan,
        isThinking: false
      }));
    } catch (error) {
      console.error(error);
      const msg = (error as Error).message;
      alert(`產生計畫失敗: ${msg}`);
      setState(prev => ({ ...prev, isThinking: false }));
    }
  };

  // 2. Update Plan Text Manually
  const handleUpdatePlan = (newPlan: StickerPlanItem[]) => {
    setState(prev => ({ ...prev, stickerPlan: newPlan }));
  };

  // 2.5 Test Generate (Single Preview)
  const handleTestGeneration = async (file: string | null, styleId: string) => {
     if (!file) {
       alert("請先上傳照片");
       return;
     }
     
     const style = STICKER_STYLES.find(s => s.id === styleId);
     const stylePrompt = style ? style.promptModifier : '';
     
     try {
       // Just generate a generic "Happy" sticker for preview
       const rawBase64 = await generateSingleStickerImage(
         "開心 (Happy)",
         stylePrompt,
         file
       );
       return rawBase64;
     } catch (e) {
       console.error(e);
       alert("試畫失敗，請檢查 API Key 設定");
       return null;
     }
  };

  // 3. Start Image Generation
  const handleStartGeneration = async () => {
    // Reset abort controller
    abortControllerRef.current = new AbortController();

    // Init results
    const initialResults: GeneratedSticker[] = state.stickerPlan.map(item => ({
      id: item.id,
      text: item.text,
      imageUrl: '',
      processedUrl: '',
      status: 'pending'
    }));

    setState(prev => ({
      ...prev,
      step: 'generating',
      results: initialResults
    }));

    const style = STICKER_STYLES.find(s => s.id === state.selectedStyleId);
    const stylePrompt = style ? style.promptModifier : '';

    // Parallel Processing with Rate Limiting
    const BATCH_SIZE = 3; 
    const ARTIFICIAL_DELAY = state.count > 16 ? 6000 : 2000; 
    
    let i = 0;
    while (i < state.stickerPlan.length) {
      if (!isMounted.current || abortControllerRef.current?.signal.aborted) break;

      const batch = state.stickerPlan.slice(i, i + BATCH_SIZE);
      
      setState(prev => ({
        ...prev,
        results: prev.results.map(r => 
          batch.some(b => b.id === r.id) ? { ...r, status: 'generating' } : r
        )
      }));

      let batchSuccess = false;
      let retryCount = 0;
      
      while (!batchSuccess && retryCount < 3) {
        if (abortControllerRef.current?.signal.aborted) break;
        
        try {
          await Promise.all(batch.map(async (item) => {
             const currentResult = state.results.find(r => r.id === item.id);
             if (currentResult?.status === 'success') return;

             const rawBase64 = await generateSingleStickerImage(
              item.text,
              stylePrompt,
              state.referenceImage
            );

            if (abortControllerRef.current?.signal.aborted) throw new Error("Aborted");

            const processedBase64 = await processStickerImage(rawBase64, item.text);

            setState(prev => ({
              ...prev,
              results: prev.results.map(r => 
                r.id === item.id 
                ? { ...r, status: 'success', imageUrl: rawBase64, processedUrl: processedBase64 } 
                : r
              )
            }));
          }));
          
          batchSuccess = true;

        } catch (error: any) {
          if (abortControllerRef.current?.signal.aborted) break;
          
          const errMsg = error.message || '';
          if (errMsg.includes('429') || errMsg.includes('Exhausted') || errMsg.includes('quota')) {
             console.warn(`Rate limit hit at index ${i}. Waiting 15s before retry...`);
             await wait(15000); 
             retryCount++;
          } else {
             console.error(`Error generating batch at ${i}`, error);
             setState(prev => ({
              ...prev,
              results: prev.results.map(r => 
                batch.some(b => b.id === r.id) ? { ...r, status: 'error' } : r
              )
             }));
             batchSuccess = true; 
          }
        }
      }

      if (i + BATCH_SIZE < state.stickerPlan.length) {
         await wait(ARTIFICIAL_DELAY);
      }
      
      i += BATCH_SIZE;
    }
  };

  // 4. Regenerate Single Sticker
  const handleRegenerateSingle = async (id: number) => {
    const item = state.stickerPlan.find(p => p.id === id);
    if (!item) return;

    setState(prev => ({
      ...prev,
      results: prev.results.map(r => r.id === id ? { ...r, status: 'generating' } : r)
    }));

    try {
       const style = STICKER_STYLES.find(s => s.id === state.selectedStyleId);
       const stylePrompt = style ? style.promptModifier : '';
       
       const rawBase64 = await generateSingleStickerImage(
         item.text,
         stylePrompt,
         state.referenceImage
       );
       const processedBase64 = await processStickerImage(rawBase64, item.text);

       setState(prev => ({
         ...prev,
         results: prev.results.map(r => 
           r.id === id
           ? { ...r, status: 'success', imageUrl: rawBase64, processedUrl: processedBase64 }
           : r
         )
       }));

    } catch (e) {
      console.error(e);
      setState(prev => ({
         ...prev,
         results: prev.results.map(r => r.id === id ? { ...r, status: 'error' } : r)
      }));
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(prev => ({
      ...prev,
      step: 'setup' 
    }));
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(initialState);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <div className="font-bold text-xl text-indigo-600 tracking-tight">AI Sticker Studio</div>
            <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{APP_VERSION}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {state.step === 'setup' && (
          <SetupForm 
            onGeneratePlan={handleGeneratePlan}
            onUpdatePlan={handleUpdatePlan}
            onStartGeneration={handleStartGeneration}
            onTestGeneration={handleTestGeneration}
            isThinking={state.isThinking}
            plan={state.stickerPlan}
          />
        )}

        {(state.step === 'generating' || state.step === 'complete') && (
          <ResultsGrid 
            stickers={state.results} 
            isGenerating={state.results.some(r => r.status === 'pending' || r.status === 'generating')}
            onReset={handleReset}
            onCancel={handleCancelGeneration}
            onRegenerateSingle={handleRegenerateSingle}
          />
        )}
      </main>
    </div>
  );
}

export default App;
