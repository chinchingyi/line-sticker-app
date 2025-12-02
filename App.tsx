
import { useState, useRef, useEffect } from 'react';
import SetupForm from './components/SetupForm';
import ResultsGrid from './components/ResultsGrid';
import { AppState, StickerPlanItem, StickerCount, GeneratedSticker } from './types';
import { generateStickerPlan, generateSingleStickerImage } from './services/geminiService';
import { processStickerImage } from './utils/imageProcessing';
import { STICKER_STYLES } from './constants';

const APP_VERSION = "v2.0.4";

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
       const msg = (e as Error).message;
       alert(`試畫失敗: ${msg}`);
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

    // SERIAL PROCESSING (One by One)
    // Google Free Tier for images is very strict (approx 2-5 RPM).
    // We must go slow.
    
    let i = 0;
    while (i < state.stickerPlan.length) {
      if (!isMounted.current || abortControllerRef.current?.signal.aborted) break;

      // Select current item
      const item = state.stickerPlan[i];
      
      // Update UI to show "Generating" for this item
      setState(prev => ({
        ...prev,
        results: prev.results.map(r => 
          r.id === item.id ? { ...r, status: 'generating' } : r
        )
      }));

      let success = false;
      let retryCount = 0;
      const MAX_RETRIES = 2; // Retry twice if rate limited
      
      while (!success && retryCount <= MAX_RETRIES) {
        if (abortControllerRef.current?.signal.aborted) break;
        
        try {
           const currentResult = state.results.find(r => r.id === item.id);
           // If already done (e.g. resumption), skip
           if (currentResult?.status === 'success') {
             success = true;
             break;
           }

           // Generate Image
           const rawBase64 = await generateSingleStickerImage(
              item.text,
              stylePrompt,
              state.referenceImage
           );

           if (abortControllerRef.current?.signal.aborted) throw new Error("Aborted");

           // Process Image (Remove BG + Text)
           const processedBase64 = await processStickerImage(rawBase64, item.text);

           // Update Success
           setState(prev => ({
              ...prev,
              results: prev.results.map(r => 
                r.id === item.id 
                ? { ...r, status: 'success', imageUrl: rawBase64, processedUrl: processedBase64 } 
                : r
              )
           }));
           
           success = true;

        } catch (error: any) {
          if (abortControllerRef.current?.signal.aborted) break;
          
          const errMsg = error.message || '';
          // Handle Rate Limits (429 or Resource Exhausted)
          if (errMsg.includes('429') || errMsg.includes('Exhausted') || errMsg.includes('quota') || errMsg.includes('RETRY')) {
             console.warn(`Rate limit hit at item ${i}. Waiting 20s...`);
             // Wait longer for retry
             await wait(20000); 
             retryCount++;
          } else {
             console.error(`Error generating item ${i}`, error);
             // Mark as error and move on
             setState(prev => ({
              ...prev,
              results: prev.results.map(r => 
                r.id === item.id ? { ...r, status: 'error' } : r
              )
             }));
             success = true; // Treated as "done" so we proceed to next
          }
        }
      }

      // If we failed after retries
      if (!success) {
         setState(prev => ({
            ...prev,
            results: prev.results.map(r => 
              r.id === item.id ? { ...r, status: 'error' } : r
            )
         }));
      }

      // Delay between images to avoid triggering rate limit immediately again
      // 5 seconds standard delay between successful generations
      if (i < state.stickerPlan.length - 1) {
         await wait(5000);
      }
      
      i++;
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
      const msg = (e as Error).message;
      if (msg.includes('429') || msg.includes('Exhausted')) {
          alert("額度已滿 (Rate Limit)。請等待約 1 分鐘後再試。");
      }
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
