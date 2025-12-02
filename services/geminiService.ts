import { GoogleGenAI, Type } from "@google/genai";
import { StickerPlanItem } from '../types';

// ==========================================
// API KEY Configuration
// ==========================================
// This service uses process.env.API_KEY as required.
// ==========================================

/**
 * Helper to get the AI instance.
 * Accesses process.env.API_KEY
 */
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
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