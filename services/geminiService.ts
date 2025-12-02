
import { GoogleGenAI, Type } from "@google/genai";
import { StickerPlanItem } from '../types';

// ==========================================
// API KEY Configuration
// ==========================================

const getAI = () => {
  // 優先使用 Vite 環境變數，如果沒有則嘗試 process.env (Node環境)
  // 使用 'as any' 避免 TypeScript 檢查錯誤
  const apiKey = (import.meta as any).env.VITE_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key 尚未設定。請在 Vercel 環境變數中設定 VITE_API_KEY。");
  }

  // 檢查使用者是否誤填了 Project ID
  if (apiKey.startsWith("gen-lang-client") || !apiKey.startsWith("AIza")) {
    throw new Error(`您輸入的 Key (${apiKey.substring(0, 15)}...) 看起來像是 Project ID。請使用以 "AIza" 開頭的 API Key。`);
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
    1. Do NOT include emojis or symbols in the text string (e.g. no❤️, no ✨). Words only.
    2. Use expressive punctuation (e.g. !!, ??) is okay.
    3. Keep text short and punchy.
    
    The stickers should cover common emotions: happiness, sadness, anger, love, greeting, goodbye, shock, laughter, etc.
  `;

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
};

/**
 * Step 2: Generate a single image from Caption Text
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

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: parts
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
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
    throw new Error("No image generated.");
  }

  return base64Image;
};
