
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { StickerPlanItem } from '../types';

// ==========================================
// API KEY Configuration
// ==========================================

const getAI = () => {
  // STRICT: Only use Vite env variable. 
  // We do NOT use process.env because it fails in client-side Vite builds often.
  const apiKey = (import.meta as any).env.VITE_API_KEY;

  if (!apiKey) {
    throw new Error("API Key 尚未設定。請確認 Vercel 環境變數 VITE_API_KEY 已正確設定。");
  }

  // Basic Validation
  if (apiKey.startsWith("gen-lang-client") || !apiKey.startsWith("AIza")) {
    throw new Error(`您輸入的 Key (${apiKey.substring(0, 10)}...) 格式錯誤。請確認您複製的是 "AIza" 開頭的 API Key，而不是 Project ID。`);
  }

  return new GoogleGenAI({ apiKey });
};

/**
 * Step 1: Generate a plan (Text Only)
 */
export const generateStickerPlan = async (
  count: number,
  context: string
): Promise<StickerPlanItem[]> => {
  const ai = getAI();
  const model = 'gemini-2.5-flash';
  
  const systemPrompt = `
    You are a creative assistant helping to design a LINE sticker set.
    The user wants ${count} stickers.
    Context/Usage: ${context || 'General daily conversation'}.
    
    Output a JSON list of objects. Each object must have:
    - "text_tc": The sticker caption in Traditional Chinese (繁體中文).
    - "text_en": The sticker caption in English.
    - "original_lang": Which language was primary (usually 'tc' for this request).
    
    CRITICAL INSTRUCTIONS FOR TEXT:
    1. Do NOT include emojis or symbols in the text string (e.g. no ❤️, no ✨). Words only.
    2. Use expressive punctuation (e.g. !!, ??) is okay.
    3. Keep text short and punchy.
    
    The stickers should cover common emotions: happiness, sadness, anger, love, greeting, goodbye, shock, laughter, etc.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: "Generate the sticker plan now.",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text_tc: { type: Type.STRING },
              text_en: { type: Type.STRING }
            },
            required: ["text_tc", "text_en"]
          }
        }
      }
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error("No response from Gemini");

    const parsed = JSON.parse(rawJson);
    
    return parsed.map((item: any, index: number) => ({
      id: index,
      text: `${item.text_tc} (${item.text_en})`,
      originalTc: item.text_tc,
      originalEn: item.text_en
    }));
  } catch (error: any) {
    console.error("Plan Generation Error:", error);
    if (error.message?.includes("400") || error.message?.includes("API key")) {
        throw new Error("API Key 無效。請檢查 Vercel 環境變數 VITE_API_KEY。");
    }
    throw error;
  }
};

/**
 * Step 2a: Generate a 2x2 GRID of stickers (4 stickers in 1 image)
 * This is the batching strategy to save API calls and time.
 */
export const generateStickerGrid = async (
  captions: string[], // Array of up to 4 captions
  stylePrompt: string,
  referenceImageBase64: string | null
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-2.5-flash-image';

  // Construct a prompt that asks for a grid layout
  const gridPrompt = `
    Generate a single character design sheet featuring 4 distinct expressions/poses arranged in a 2x2 grid layout.
    
    The 4 expressions should correspond to these meanings:
    1. Top-Left: ${captions[0] || 'Happy'}
    2. Top-Right: ${captions[1] || 'Sad'}
    3. Bottom-Left: ${captions[2] || 'Angry'}
    4. Bottom-Right: ${captions[3] || 'Excited'}
    
    Style Guidelines: ${stylePrompt}
    
    Composition Rules:
    - Output must be a 2x2 grid.
    - Each quadrant contains ONE character pose.
    - Background must be solid white (#FFFFFF).
    - Do NOT draw grid lines if possible, just arrange them neatly.
    - Character must be consistent across all 4 poses.
    - NO text inside the grid.
  `;

  const parts: any[] = [];
  
  if (referenceImageBase64) {
    const data = referenceImageBase64.split(',')[1];
    const mimeType = referenceImageBase64.substring(
      referenceImageBase64.indexOf(":") + 1, 
      referenceImageBase64.indexOf(";")
    );

    parts.push({
      inlineData: { mimeType: mimeType, data: data }
    });
    parts.push({
      text: "STRICT: The character in the grid MUST match the provided reference image (same breed/person, accessories)."
    });
  }

  parts.push({ text: gridPrompt });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: {
        imageConfig: { aspectRatio: "1:1" },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ]
      }
    });

    let base64Image = '';
    const partsResponse = response.candidates?.[0]?.content?.parts;
    
    if (partsResponse) {
      for (const part of partsResponse) {
        if (part.inlineData && part.inlineData.data) {
          base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      if (response.candidates?.[0]?.finishReason) {
         throw new Error(`生成被阻擋 (Safety: ${response.candidates[0].finishReason})`);
      }
      throw new Error("生成失敗：模型未回傳圖片");
    }

    return base64Image;

  } catch (error: any) {
    console.error("Grid Gen Error:", error);
    const msg = error.message || '';
    if (msg.includes('429') || msg.includes('Exhausted') || msg.includes('quota')) {
      throw new Error("HTTP 429: 配額用盡 (Resource Exhausted)。請等待稍後再試。");
    }
    throw error;
  }
};

/**
 * Step 2b: Generate a single image (Fallback or Regenerate Single)
 */
export const generateSingleStickerImage = async (
  textCaption: string,
  stylePrompt: string,
  referenceImageBase64: string | null
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-2.5-flash-image';
  
  const finalPrompt = `
    Generate a LINE sticker image based on this meaning: "${textCaption}".
    
    Instructions:
    1. Understand the meaning and emotion of the caption "${textCaption}" (Ignore the English part if present, focus on the Traditional Chinese meaning).
    2. Draw a character performing an action or showing an expression that perfectly matches this caption.
    3. Style: ${stylePrompt}.
    4. Composition: Character centered, Sticker art style, High contrast.
    5. Background: Solid pure white (#FFFFFF) for easy removal.
    
    NEGATIVE PROMPT (STRICT):
    - Do NOT render any text, words, or letters inside the image. The image should be art only. Text will be added later programmatically.
    - Do NOT cut off the character's head or face.
  `;

  const parts: any[] = [];
  
  if (referenceImageBase64) {
    const data = referenceImageBase64.split(',')[1];
    const mimeType = referenceImageBase64.substring(
      referenceImageBase64.indexOf(":") + 1, 
      referenceImageBase64.indexOf(";")
    );

    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: data
      }
    });

    parts.push({
      text: "STRICT INSTRUCTION: The output character MUST look exactly like the subject in the provided reference image (same breed/person, same key features, colors, and accessories), but adapted to the requested art style."
    });
  }

  parts.push({ text: finalPrompt });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ]
      }
    });

    let base64Image = '';
    const partsResponse = response.candidates?.[0]?.content?.parts;
    
    if (partsResponse) {
      for (const part of partsResponse) {
        if (part.inlineData && part.inlineData.data) {
          base64Image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      if (response.candidates?.[0]?.finishReason) {
         throw new Error(`生成被阻擋 (Safety: ${response.candidates[0].finishReason})`);
      }
      throw new Error("生成失敗：模型未回傳圖片 (No image generated).");
    }

    return base64Image;

  } catch (error: any) {
    console.error("Image Gen Error:", error);
    const msg = error.message || '';
    
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      throw new Error("HTTP 429: 配額用盡 (Resource Exhausted)。請等待 15-30 秒後再試。");
    }
    if (msg.includes('API key')) {
      throw new Error("API Key 無效或未授權。");
    }
    if (msg.includes('Safety') || msg.includes('Blocked')) {
      throw new Error("安全阻擋：圖片可能被誤判，請換張照片或風格。");
    }
    throw error;
  }
};
