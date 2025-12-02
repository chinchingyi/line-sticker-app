
/**
 * Processes the raw AI image:
 * 1. Resizes to 320x320.
 * 2. Removes white background (Approximate chroma key).
 * 3. Adds the text caption with a stroke.
 */
export const processStickerImage = async (
  base64Image: string,
  text: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = base64Image;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }

      // LINE Sticker Standard Size
      const SIZE = 320;
      canvas.width = SIZE;
      canvas.height = SIZE;

      // 1. Draw Image (Contain fit)
      // We want to keep aspect ratio but fit in 320x320.
      // Usually GenAI returns square 1:1, but just in case.
      // We also leave some padding for the text.
      const padding = 20;
      const drawWidth = SIZE - (padding * 2);
      const drawHeight = SIZE - (padding * 2);
      
      ctx.drawImage(img, padding, padding, drawWidth, drawHeight);

      // 2. Remove White Background (Simple algorithm)
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
      const data = imageData.data;
      const threshold = 240; // Sensitivity for "white"

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // If pixel is very light (white/off-white)
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; // Set Alpha to 0 (Transparent)
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // 3. Draw Text
      if (text) {
        ctx.save();
        
        // Random slight rotation for fun (-5 to 5 degrees)
        const angle = (Math.random() * 8 - 4) * (Math.PI / 180);
        
        const x = SIZE / 2;
        const y = SIZE - 20;

        // Move context for rotation
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Auto-scale font size (Reduced per user request)
        let fontSize = 34; // Reduced from 40 to 34
        const minFontSize = 20;
        const maxTextWidth = SIZE - 20; // Allow 10px padding on sides

        ctx.font = `900 ${fontSize}px "Noto Sans TC", sans-serif`;
        
        // Decrease font size until it fits
        while (ctx.measureText(text).width > maxTextWidth && fontSize > minFontSize) {
          fontSize -= 2;
          ctx.font = `900 ${fontSize}px "Noto Sans TC", sans-serif`;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;

        // Shadow for depth (softer to avoid double-text look)
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Thick White Outline (Stroke)
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 6; // Reduced from 8 to 6
        ctx.strokeText(text, 0, 0);

        // Inner Text Fill
        ctx.fillStyle = '#333333';
        ctx.shadowColor = "transparent"; // Remove shadow for fill to stay crisp
        ctx.fillText(text, 0, 0);
        
        ctx.restore();
      }

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (err) => reject(err);
  });
};

/**
 * Creates a resized version of the processed sticker for LINE main.png/tab.png
 */
export const createResizedVariant = async (
  base64Image: string, 
  targetWidth: number, 
  targetHeight: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error("No context"));
      }
    };
    img.onerror = reject;
  });
};

/**
 * Resize a large uploaded image to a max dimension to prevent API payload errors
 */
export const resizeImageFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const MAX_DIM = 800; // Limit max dimension to 800px
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          } else {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85)); // Use JPEG 0.85 for compression
        } else {
            reject(new Error("Canvas context failed"));
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const downloadBlob = (content: Blob, filename: string) => {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
