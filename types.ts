
import { LucideIcon } from 'lucide-react';

export interface StickerStyle {
  id: string;
  name: string;
  promptModifier: string;
  previewColor: string;
  icon: LucideIcon;
}

export interface StickerPlanItem {
  id: number;
  text: string;
  originalTc: string; // Store original Chinese for toggling
  originalEn: string; // Store original English for toggling
}

export interface GeneratedSticker {
  id: number;
  text: string;
  imageUrl: string; // The raw image from AI
  processedUrl: string; // The 320x320 png with text and transparency
  status: 'pending' | 'generating' | 'success' | 'error';
  error?: string; // Reason for failure
}

export type StickerCount = 8 | 16 | 24;

export interface AppState {
  step: 'setup' | 'review' | 'generating' | 'complete';
  referenceImage: string | null; // Base64
  selectedStyleId: string;
  count: StickerCount;
  usageContext: string;
  stickerPlan: StickerPlanItem[];
  results: GeneratedSticker[];
  isThinking: boolean;
  progress: number;
}
