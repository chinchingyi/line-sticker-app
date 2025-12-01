import { StickerStyle } from './types';
import { Sparkles, Box, PenTool, Smile, Mountain, Highlighter, Zap, Pencil } from 'lucide-react';

export const STICKER_STYLES: StickerStyle[] = [
  {
    id: 'shojo_manga',
    name: '少女漫畫',
    promptModifier: 'shojo manga style, sparkling big eyes, flowery background elements, delicate lines, romantic atmosphere, pastel colors, very detailed, white background',
    previewColor: 'bg-pink-200 text-pink-600',
    icon: Sparkles
  },
  {
    id: 'american_3d',
    name: '美式 3D',
    promptModifier: 'pixar style 3d render, cute character design, expressive big eyes, soft lighting, vibrant colors, 3d animation style, high quality, white background',
    previewColor: 'bg-blue-100 text-blue-600',
    icon: Box
  },
  {
    id: 'hand_drawn_sketch',
    name: '手繪素描',
    promptModifier: 'hand-drawn pencil sketch style, artistic, rough textured lines, black and white with subtle colors, sketchbook aesthetic, white background',
    previewColor: 'bg-stone-100 text-stone-600',
    icon: PenTool
  },
  {
    id: 'chibi_cute',
    name: 'Q版可愛',
    promptModifier: 'chibi style, super cute, big head small body, kawaii, simple flat colors, vector illustration, sticker art, clean lines, white background',
    previewColor: 'bg-pink-100 text-pink-500',
    icon: Smile
  },
  {
    id: 'ukiyo_e',
    name: '浮世繪',
    promptModifier: 'traditional japanese ukiyo-e style, woodblock print aesthetic, bold outlines, flat colors, textured paper, historical art style, white background',
    previewColor: 'bg-red-100 text-red-600',
    icon: Mountain
  },
  {
    id: 'marker_doodle',
    name: '馬克筆',
    promptModifier: 'marker pen doodle style, bold vibrant colors, hand drawn marker texture, white border, pop art feel, casual and cute, white background',
    previewColor: 'bg-yellow-100 text-yellow-600',
    icon: Highlighter
  },
  {
    id: 'retro_pop',
    name: '美式復古',
    promptModifier: 'retro pop art style, halftone patterns, comic book aesthetic, 1950s style, bold colors, white background',
    previewColor: 'bg-orange-100 text-orange-600',
    icon: Zap
  },
  {
    id: 'crayon',
    name: '蠟筆塗鴉',
    promptModifier: 'children crayon drawing style, rough texture, waxy finish, naive and cute, playful, white background',
    previewColor: 'bg-teal-100 text-teal-600',
    icon: Pencil
  }
];

export const STICKER_COUNTS = [8, 16, 24];