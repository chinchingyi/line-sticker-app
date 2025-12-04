
import { useState, useRef, useEffect } from 'react';
import SetupForm from './components/SetupForm';
import ResultsGrid from './components/ResultsGrid';
import { AppState, StickerPlanItem, StickerCount, GeneratedSticker } from './types';
import { generateStickerPlan, generateSingleStickerImage, generateStickerGrid } from './services/geminiService';
import { processStickerImage, sliceImageGrid } from './utils/imageProcessing';
import { STICKER_STYLES } from './constants';

const APP_VERSION = "v2.1.1";

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

  // 3. Start Image Generation (Grid Batch Strategy)
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

    // GRID BATCH PROCESSING
    // We process 4 stickers at a time (2x2 Grid)
    // This reduces API calls by 75% (e.g. 24 stickers = 6 calls instead of 24)
    const BATCH_SIZE = 4;
    
    let i = 0;
    while (i < state.stickerPlan.length) {
      if (!isMounted.current || abortControllerRef.current?.signal.aborted) break;

      // Get the current batch of 4 items (or less if at the end)
      const currentBatch = state.stickerPlan.slice(i, i + BATCH_SIZE);
      const batchIds = currentBatch.map(item => item.id);

      // Update UI to show "Generating" for this batch
      setState(prev => ({
        ...prev,
        results: prev.results.map(r => 
          batchIds.includes(r.id) ? { ...r, status: 'generating' } : r
        )
      }));

      try {
        // 1. Generate ONE 2x2 Grid Image for these 4 items
        // We pass the texts of all 4 items to the AI
        const captions = currentBatch.map(item => item.text);
        
        const gridBase64 = await generateStickerGrid(
           captions,
           stylePrompt,
           state.referenceImage
        );

        if (abortControllerRef.current?.signal.aborted) throw new Error("Aborted");

        // 2. Slice the grid into individual images (up to 4)
        const slicedImages = await sliceImageGrid(gridBase64, currentBatch.length);

        // 3. Process each slice individually (Remove BG + Add Text)
        // We can do this in parallel as it is local processing
        const processPromises = slicedImages.map(async (imgBase64, idx) => {
           const item = currentBatch[idx];
           const processed = await processStickerImage(imgBase64, item.text);
           return {
             id: item.id,
             raw: imgBase64,
             processed: processed
           };
        });

        const processedResults = await Promise.all(processPromises);

        // 4. Update Success State
        setState(prev => ({
           ...prev,
           results: prev.results.map(r => {
             const found = processedResults.find(p => p.id === r.id);
             if (found) {
               return { ...r, status: 'success', imageUrl: found.raw, processedUrl: found.processed };
             }
             return r;
           })
        }));

      } catch (error: any) {
        if (abortControllerRef.current?.signal.aborted) break;
        
        console.error(`Error generating batch starting at ${i}`, error);
        const errMsg = error.message || "生成失敗";
        
        // Mark whole batch as error
        setState(prev => ({
          ...prev,
          results: prev.results.map(r => 
            batchIds.includes(r.id) ? { ...r, status: 'error', error: errMsg } : r
          )
        }));
        
        // If rate limited, we might want to pause longer, but usually batching prevents this.
        if (errMsg.includes('429') || errMsg.includes('Exhausted')) {
           await wait(10000); 
        }
      }

      // Delay between batches to be safe
      // 10 seconds delay between grid generations
      if (i + BATCH_SIZE < state.stickerPlan.length) {
         await wait(10000);
      }
      
      i += BATCH_SIZE;
    }
  };

  // 4. Regenerate Single Sticker (Uses Single Image API)
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
      setState(prev => ({
         ...prev,
         results: prev.results.map(r => r.id === id ? { ...r, status: 'error', error: msg } : r)
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
