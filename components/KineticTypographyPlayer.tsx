
import React, { useRef, useEffect, useState } from 'react';
import { TranscriptSegment } from '../services/geminiService';
import { BackgroundType } from '../App';

interface KineticTypographyPlayerProps {
  script: string;
  transcriptSegments?: TranscriptSegment[];
  onComplete: (url: string) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: string) => void;
  width: number;
  height: number;
  fontSize: 'Small' | 'Medium' | 'Large';
  animation: 'Typewriter' | 'FadeZoom' | 'DropIn';
  audioSrc?: string | null;
  visualStyle: 'Minimalist' | 'Glitchy' | 'Retro';
  textStyle?: 'Fill' | 'Outline' | 'Neon' | '3D';
  fontFamily: 'Sans' | 'Serif' | 'Handwritten' | 'Round' | 'Dongle' | 'Pen';
  fontWeight: 'Light' | 'Normal' | 'Bold';
  isPreviewMode?: boolean;
  backgroundType?: BackgroundType;
  backgroundSource?: string;
}

type TextStyleEffect = 'wiggle' | 'glitch' | 'pulse';

interface StyleSpan {
  text: string;
  style: {
    color?: string;
    effect?: TextStyleEffect;
  };
}

interface Word {
  cleanText: string;
  isHighlight: boolean;
  spans: StyleSpan[];
  x: number;
  y: number;
  alpha: number;
  scale: number;
  yOffset: number;
  absoluteStartTime?: number;
  duration?: number; // Added duration to track active state
}

interface WordToLayout {
  cleanText: string;
  isHighlight: boolean;
  spans: StyleSpan[];
  absoluteStartTime?: number;
  duration?: number;
}

type Line = {
  words: WordToLayout[];
  width: number;
};

const FONT_CONFIG = {
    Small: { size: 24, lineHeight: 40 },
    Medium: { size: 32, lineHeight: 50 },
    Large: { size: 40, lineHeight: 60 },
};

const THEME_CONFIG = {
    Minimalist: { 
        baseColor: '#FFFFFF', 
        highlightColor: '#FFE100', // Bright Yellow for Active
        accentColor: '#FF3333'     // Red for emphasized words
    },
    Glitchy: { 
        baseColor: '#00FF00', 
        highlightColor: '#FFFFFF', // White hot
        accentColor: '#FF00FF'
    },
    Retro: { 
        baseColor: '#FFB86C', 
        highlightColor: '#FFFF00', // Yellow
        accentColor: '#FF5555' 
    }
};

const FONT_FAMILIES = {
    Sans: '"Noto Sans KR", sans-serif',
    Serif: '"Gowun Batang", serif',
    Handwritten: '"Gaegu", cursive',
    Round: '"Jua", sans-serif',         // Jua is a great rounded font
    Dongle: '"Dongle", sans-serif',     // Dongle is very condensed
    Pen: '"Nanum Pen Script", cursive'  // Nanum Pen Script
};

const FONT_WEIGHTS = {
    Light: '300',
    Normal: '400',
    Bold: '700'
};

const BACKGROUND_AUDIO_URL = 'https://cdn.pixabay.com/download/audio/2022/11/21/audio_a3a1b32a9c.mp3'; 
const WORDS_PER_PAGE = 5;
// REMOVED SYNC_OFFSET: The artificial delay caused drift perception in long files.
const SYNC_OFFSET = 0.0; 

// Helper for Object-Fit: Cover on Canvas
const drawCover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number) => {
    let imgW: number;
    let imgH: number;
    
    if (img instanceof HTMLVideoElement) {
        imgW = img.videoWidth;
        imgH = img.videoHeight;
    } else if (img instanceof HTMLImageElement) {
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
    } else {
        return;
    }
    
    if (imgW === 0 || imgH === 0) return;

    const scale = Math.max(w / imgW, h / imgH);
    const x = (w / 2) - (imgW / 2) * scale;
    const y = (h / 2) - (imgH / 2) * scale;
    
    ctx.drawImage(img, x, y, imgW * scale, imgH * scale);
};


const parseStyledWord = (rawWord: string): WordToLayout => {
    const isHighlight = rawWord.startsWith('*') && rawWord.endsWith('*');
    const textToParse = rawWord.replace(/^\*|\*$/g, '');
    const spans: StyleSpan[] = [];
    let cleanText = '';
    let lastIndex = 0;
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(textToParse)) !== null) {
        if (match.index > lastIndex) {
            const plainPart = textToParse.substring(lastIndex, match.index);
            spans.push({ text: plainPart, style: {} });
            cleanText += plainPart;
        }
        const styledText = match[1];
        const params = match[2];
        let color: string | undefined;
        let effect: TextStyleEffect | undefined;
        const parts = params.split('|');
        parts.forEach(part => {
            const trimmed = part.trim();
            if (['wiggle', 'glitch', 'pulse'].includes(trimmed)) {
                effect = trimmed as TextStyleEffect;
            } else {
                color = trimmed;
            }
        });
        spans.push({ text: styledText, style: { color, effect } });
        cleanText += styledText;
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < textToParse.length) {
        const remainingPart = textToParse.substring(lastIndex);
        spans.push({ text: remainingPart, style: {} });
        cleanText += remainingPart;
    }
    if (spans.length === 0) {
        spans.push({ text: textToParse, style: {} });
        cleanText = textToParse;
    }
    return { cleanText, isHighlight, spans };
};

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const getSupportedMimeType = () => {
    const types = [
        'video/webm;codecs=vp9', // Best for Alpha/High Quality
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return undefined;
};

export const KineticTypographyPlayer: React.FC<KineticTypographyPlayerProps> = ({ 
    script, 
    transcriptSegments,
    onComplete,
    onProgress,
    onError,
    width, 
    height, 
    fontSize, 
    animation, 
    audioSrc, 
    visualStyle,
    textStyle = 'Fill',
    fontFamily,
    fontWeight,
    isPreviewMode = false,
    backgroundType = 'solid',
    backgroundSource = '#000000'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const audioDurationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStartTimeRef = useRef<number>(0);
  
  // Background Assets References
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bgAssetsLoaded, setBgAssetsLoaded] = useState(false);
  
  const currentTheme = THEME_CONFIG[visualStyle];

  // Load Background Assets
  useEffect(() => {
      setBgAssetsLoaded(false);
      
      if (backgroundType === 'image' && backgroundSource) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = backgroundSource;
          img.onload = () => {
              bgImageRef.current = img;
              setBgAssetsLoaded(true);
          };
      } else if (backgroundType === 'video' && backgroundSource) {
          const vid = document.createElement('video');
          vid.crossOrigin = "anonymous";
          vid.src = backgroundSource;
          vid.loop = true;
          vid.muted = true; // Essential for autoplay
          vid.playsInline = true;
          vid.onloadeddata = () => {
              bgVideoRef.current = vid;
              vid.play();
              setBgAssetsLoaded(true);
          };
      } else {
          setBgAssetsLoaded(true); // Solid/Transparent don't need loading
      }
      
      return () => {
          if (bgVideoRef.current) {
              bgVideoRef.current.pause();
              bgVideoRef.current.src = "";
          }
      };
  }, [backgroundType, backgroundSource]);

  useEffect(() => {
    if (!bgAssetsLoaded) return; // Wait for assets

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    isStoppingRef.current = false;
    audioDurationRef.current = null;
    if (onProgress) onProgress(0);

    const startAnimation = () => {
        if (isPreviewMode) {
            animateScript(ctx, width, height);
        }
    };

    if (isPreviewMode) {
        startAnimation();
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }

    const setupAndStartRecorder = async () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            audioContextRef.current = audioContext;
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const audioUrlToLoad = audioSrc || BACKGROUND_AUDIO_URL;
            let audioBuffer: AudioBuffer | null = null;
            let dest: MediaStreamAudioDestinationNode | null = null;

            try {
                const response = await fetch(audioUrlToLoad);
                const arrayBuffer = await response.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                if (audioSrc) {
                    audioDurationRef.current = audioBuffer.duration;
                }

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                if (!audioSrc) {
                    source.loop = true;
                }

                dest = audioContext.createMediaStreamDestination();
                source.connect(dest);
                
                // Tight start timing
                audioStartTimeRef.current = audioContext.currentTime; 
                source.start(audioStartTimeRef.current);

            } catch (audioErr) {
                console.warn("Audio load failed, proceeding with silent video.", audioErr);
                audioStartTimeRef.current = performance.now() / 1000;
            }

            let videoStream: MediaStream;
            try {
                // @ts-ignore
                videoStream = canvas.captureStream ? canvas.captureStream(30) : (canvas as any).webkitCaptureStream(30);
            } catch (e) {
                throw new Error("Canvas capturing is not supported on this browser.");
            }
            
            let finalTracks = videoStream.getVideoTracks();
            if (dest) {
                const audioTracks = dest.stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    finalTracks = [...finalTracks, audioTracks[0]];
                }
            }
            const finalStream = new MediaStream(finalTracks);
            const mimeType = getSupportedMimeType();
            
            try {
                mediaRecorderRef.current = new MediaRecorder(finalStream, { 
                    mimeType: mimeType || 'video/webm',
                    videoBitsPerSecond: 25000000 
                });
            } catch (e) {
                console.warn("MediaRecorder creation failed with specific options, trying defaults.", e);
                mediaRecorderRef.current = new MediaRecorder(finalStream);
            }

            const chunks: Blob[] = [];
            mediaRecorderRef.current.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
              try {
                  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
                  if (blob.size === 0) throw new Error("Generated video file is empty.");
                  const url = URL.createObjectURL(blob);
                  onComplete(url);
              } catch (e) {
                  console.error("Blob creation failed", e);
                  if (onError) onError("Failed to finalize video file.");
              }
            };

            mediaRecorderRef.current.start();
            animateScript(ctx, width, height);

        } catch (err) {
            console.error("Critical error in setupAndStartRecorder:", err);
            if (onError) onError(err instanceof Error ? err.message : "Failed to initialize video recording.");
        }
    };

    setupAndStartRecorder();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !isStoppingRef.current) {
        isStoppingRef.current = true;
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) {
          audioContextRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, width, height, fontSize, animation, onComplete, audioSrc, visualStyle, fontFamily, fontWeight, isPreviewMode, transcriptSegments, bgAssetsLoaded, backgroundType, backgroundSource, textStyle]);
  
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  
  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (backgroundType === 'transparent') {
          ctx.clearRect(0, 0, w, h);
      } else if (backgroundType === 'image' && bgImageRef.current) {
          drawCover(ctx, bgImageRef.current, w, h);
      } else if (backgroundType === 'video' && bgVideoRef.current) {
          drawCover(ctx, bgVideoRef.current, w, h);
      } else {
          // Default to Solid Color
          ctx.fillStyle = backgroundSource || '#000000';
          ctx.fillRect(0, 0, w, h);
      }
  };

  const animateScript = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const useSegments = transcriptSegments && transcriptSegments.length > 0 && !isPreviewMode;
    const allWords: WordToLayout[] = script.split(/\s+/).filter(w => w).map(parseStyledWord);
    
    // FASTER FADE FOR SNAPPIER FEEL
    const FADE_DURATION = 80; 
    
    // Scale Font Size for specific fonts like Dongle
    let config = FONT_CONFIG[fontSize];
    if (fontFamily === 'Dongle') {
        config = { size: config.size * 2, lineHeight: config.lineHeight * 1.5 };
    } else if (fontFamily === 'Pen') {
         config = { size: config.size * 1.5, lineHeight: config.lineHeight * 1.2 };
    }

    const fontString = `${FONT_WEIGHTS[fontWeight]} ${config.size}px ${FONT_FAMILIES[fontFamily]}`;

    // --- TIMING-ACCURATE MODE (SEGMENTS) ---
    if (useSegments) {
        // DRIFT CORRECTION LOGIC
        // We calculate the ratio between the actual audio file duration and the transcript's end time.
        // We then scale all transcript timestamps by this ratio to ensure the text ends exactly when the audio ends.
        let timeScale = 1.0;
        if (audioDurationRef.current && transcriptSegments.length > 0) {
             const lastSegmentEnd = transcriptSegments[transcriptSegments.length - 1].end;
             const audioDuration = audioDurationRef.current;
             
             // Only apply correction if the mismatch is significant (>0.5s) to avoid unnecessary jitter
             if (Math.abs(audioDuration - lastSegmentEnd) > 0.5) {
                 const potentialScale = audioDuration / lastSegmentEnd;
                 // Safety bounds: Only correct if drift is within ±20% (0.8 ~ 1.2)
                 // This prevents breaking the video if the transcript is wildly incorrect (e.g. half missing).
                 if (potentialScale > 0.8 && potentialScale < 1.2) {
                     timeScale = potentialScale;
                     // console.debug(`[Auto-Sync] Applied drift correction: x${timeScale.toFixed(4)}`);
                 }
             }
        }

        const pageLayouts = transcriptSegments.map(seg => {
            // Apply Drift Correction
            const adjustedStart = seg.start * timeScale;
            const adjustedEnd = seg.end * timeScale;
            
            const segmentDuration = (adjustedEnd - adjustedStart) * 1000;
            const segmentWords = seg.text.split(/\s+/).filter(w => w).map(parseStyledWord);
            
            // Calculate word duration for "Active" state
            const timePerWord = segmentWords.length > 0 ? (segmentDuration) / segmentWords.length : 0;
            const segmentStartTime = adjustedStart * 1000;

            const wordsWithTiming: WordToLayout[] = segmentWords.map((word, i) => ({
                ...word,
                absoluteStartTime: segmentStartTime + (i * timePerWord),
                duration: timePerWord // Store duration for active tracking
            }));
            
            return {
                layout: calculateLayoutForWords(ctx, wordsWithTiming, w, h, config, fontString),
                start: adjustedStart * 1000,
                end: adjustedEnd * 1000,
                index: 0
            };
        }).map((p, i) => ({ ...p, index: i }));

        let totalDuration = 0;
        if (transcriptSegments.length > 0) {
            // Recalculate total duration based on corrected timestamps
            const lastSegment = pageLayouts[pageLayouts.length - 1];
            totalDuration = Math.max(lastSegment.end + 1000, audioDurationRef.current ? audioDurationRef.current * 1000 : 0);
        }

        const render = () => {
            let actualElapsedTime = 0;
            if (audioContextRef.current) {
                // Precise audio clock
                actualElapsedTime = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000;
            } else {
                actualElapsedTime = performance.now(); 
            }

            const visualTime = actualElapsedTime + (SYNC_OFFSET * 1000);
            
            if (onProgress) {
                const progress = Math.min(100, Math.round((actualElapsedTime / totalDuration) * 100));
                onProgress(progress);
            }
            
            // Draw Background every frame
            drawBackground(ctx, w, h);

            let activePage = pageLayouts.find(p => visualTime >= p.start && visualTime < p.end);

            if (!activePage) {
                if (visualTime < pageLayouts[0].start) {
                     activePage = pageLayouts[0];
                } else if (visualTime >= pageLayouts[pageLayouts.length - 1].end) {
                     activePage = pageLayouts[pageLayouts.length - 1];
                } else {
                    const prevSegment = [...pageLayouts].reverse().find(p => p.end <= visualTime);
                    if (prevSegment) {
                        activePage = prevSegment;
                    } else {
                        activePage = pageLayouts[0];
                    }
                }
            }

            if (activePage) {
                renderPage(ctx, activePage.layout, visualTime, FADE_DURATION, animation, fontString);
            }

            if (actualElapsedTime < totalDuration) {
                animationFrameId.current = requestAnimationFrame(render);
            } else {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && !isStoppingRef.current) {
                    isStoppingRef.current = true;
                    if (onProgress) onProgress(100);
                    mediaRecorderRef.current.stop();
                }
            }
        };
        animationFrameId.current = requestAnimationFrame(render);
        return;
    }

    // --- FALLBACK PAGED MODE ---
    const isLongScript = allWords.length > 30;
    const shouldUsePagedMode = (audioSrc && audioDurationRef.current && !isPreviewMode) || (isLongScript && !isPreviewMode);

    if (shouldUsePagedMode) {
        const pages = chunk(allWords, WORDS_PER_PAGE);
        let totalDuration = audioDurationRef.current ? audioDurationRef.current * 1000 : Math.max(5000, allWords.length * 500);
        const pageDuration = pages.length > 0 ? totalDuration / pages.length : totalDuration;
        
        const pageLayouts = pages.map((pageWords, pageIndex) => {
            const pageStartTime = pageIndex * pageDuration;
            const timePerWord = pageWords.length > 0 ? (pageDuration * 0.9) / pageWords.length : 0;

            const wordsWithTiming: WordToLayout[] = pageWords.map((word, i) => ({
                ...word,
                absoluteStartTime: pageStartTime + (i * timePerWord),
                duration: timePerWord
            }));
            
            return calculateLayoutForWords(ctx, wordsWithTiming, w, h, config, fontString);
        });
        
        let startTime = performance.now();
        const render = (time: number) => {
            let actualElapsedTime = 0;
            if (audioContextRef.current && audioSrc) {
                actualElapsedTime = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000;
            } else {
                actualElapsedTime = time - startTime;
            }
            
            const visualTime = actualElapsedTime + (SYNC_OFFSET * 1000);

            if (onProgress) {
                const progress = Math.min(100, Math.round((actualElapsedTime / totalDuration) * 100));
                onProgress(progress);
            }
            
            // Draw Background
            drawBackground(ctx, w, h);

            if (pages.length > 0) {
                const pageIndex = Math.min(pages.length - 1, Math.floor(visualTime / pageDuration));
                const currentPageLayout = pageLayouts[pageIndex];
                if (currentPageLayout) {
                    renderPage(ctx, currentPageLayout, visualTime, FADE_DURATION, animation, fontString);
                }
            }

            if (actualElapsedTime < totalDuration) {
                animationFrameId.current = requestAnimationFrame(render);
            } else {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && !isStoppingRef.current) {
                    isStoppingRef.current = true;
                    if (onProgress) onProgress(100);
                    mediaRecorderRef.current.stop();
                }
            }
        };
        animationFrameId.current = requestAnimationFrame(render);
        return;
    }

    // --- PREVIEW MODE ---
    const holdEndDuration = isPreviewMode ? 2000 : 5000;
    const defaultTypeSpeed = 250;
    let cumulativeTime = 0;
    const summaryWordTimings: number[] = [];
    allWords.forEach((word) => {
        summaryWordTimings.push(cumulativeTime);
        let delay = defaultTypeSpeed;
        if (word.cleanText.endsWith('.') || word.cleanText.endsWith('!') || word.cleanText.endsWith('?')) delay *= 2.5;
        else if (word.cleanText.endsWith(',')) delay *= 1.8;
        cumulativeTime += delay;
    });

    let animationFinishTime = 0;
    if (allWords.length > 0) {
        animationFinishTime = summaryWordTimings[allWords.length - 1] + FADE_DURATION;
    }
    const totalDuration = animationFinishTime + holdEndDuration;

    // Apply basic timing to preview layout
    const wordsWithTiming = allWords.map((word, i) => ({
        ...word,
        absoluteStartTime: summaryWordTimings[i],
        duration: defaultTypeSpeed
    }));

    const fullLayout = calculateLayoutForWords(ctx, wordsWithTiming, w, h, config, fontString);

    let startTime = performance.now();
    const render = (time: number) => {
      let elapsedTime = time - startTime;
      if (isPreviewMode) elapsedTime = elapsedTime % totalDuration;
      else if (onProgress) onProgress(Math.min(100, Math.round((elapsedTime / totalDuration) * 100)));
      
      // Draw Background
      drawBackground(ctx, w, h);

      renderPage(ctx, fullLayout, elapsedTime, FADE_DURATION, animation, fontString);
      
      if (isPreviewMode || elapsedTime < totalDuration) {
        animationFrameId.current = requestAnimationFrame(render);
      } else {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && !isStoppingRef.current) {
            isStoppingRef.current = true;
            if (onProgress) onProgress(100);
            mediaRecorderRef.current.stop();
        }
      }
    };
    animationFrameId.current = requestAnimationFrame(render);
  };
  
  const calculateLayoutForWords = (
      ctx: CanvasRenderingContext2D,
      words: WordToLayout[],
      w: number, h: number,
      initialConfig: { size: number, lineHeight: number },
      fullFontString: string
  ): Word[] => {
      const padding = w * 0.1;
      ctx.textBaseline = 'top';

      let finalFontSize = initialConfig.size;
      const lineHeightRatio = initialConfig.lineHeight / initialConfig.size;
      let lines: Line[], totalHeight;
      const spaceWidth = ctx.measureText(" ").width;
      let loops = 0;

      do {
          const fontParts = fullFontString.split('px');
          // Important: We need to reconstruct the font string preserving the font family
          const currentFontString = `${fontParts[0].split(' ').slice(0, -1).join(' ')} ${finalFontSize}px${fontParts[1]}`;
          ctx.font = currentFontString;
          const maxWidth = w - padding * 2;
          lines = [];
          
          const measuredWords = words.map(word => ({
              ...word,
              width: ctx.measureText(word.cleanText).width
          }));
          
          let currentLineWords: WordToLayout[] = [];
          
          // Simple greedy line wrapping
          measuredWords.forEach((word) => {
             const testLineWords = [...currentLineWords, word];
             const testLineText = testLineWords.map(w => w.cleanText).join(" ");
             if (ctx.measureText(testLineText).width > maxWidth && currentLineWords.length > 0) {
                 const currentLineText = currentLineWords.map(w => w.cleanText).join(" ");
                 lines.push({ words: currentLineWords, width: ctx.measureText(currentLineText).width });
                 currentLineWords = [word];
             } else {
                 currentLineWords.push(word);
             }
          });
          if (currentLineWords.length > 0) {
              const lastLineText = currentLineWords.map(w => w.cleanText).join(" ");
              lines.push({ words: currentLineWords, width: ctx.measureText(lastLineText).width });
          }

          totalHeight = lines.length * (finalFontSize * lineHeightRatio);
          if (totalHeight > h - padding * 2) finalFontSize -= 2; 
          loops++;
      } while (totalHeight > h - padding * 2 && finalFontSize > 10 && loops < 20);
      
      const finalConfig = { size: finalFontSize, lineHeight: finalFontSize * lineHeightRatio };
      const fontParts = fullFontString.split('px');
      const usedFont = `${fontParts[0].split(' ').slice(0, -1).join(' ')} ${finalConfig.size}px${fontParts[1]}`;
      ctx.font = usedFont;
      
      const startY = (h - totalHeight) / 2;
      const wordPositions: Word[] = [];
      const finalSpaceWidth = ctx.measureText(" ").width;
      
      lines.forEach((line, lineIndex) => {
          let currentX = (w - line.width) / 2;
          const currentY = startY + lineIndex * finalConfig.lineHeight;
          line.words.forEach(word => {
              wordPositions.push({
                  ...word,
                  x: currentX,
                  y: currentY,
                  alpha: 0, scale: 1, yOffset: 0,
                  duration: word.duration
              });
              currentX += ctx.measureText(word.cleanText).width + finalSpaceWidth;
          });
      });
      return wordPositions;
  };

  const renderPage = (ctx: CanvasRenderingContext2D, layout: Word[], elapsedTime: number, fadeDuration: number, animation: string, fontString: string) => {
    layout.forEach((word) => {
        const wordStartTime = word.absoluteStartTime ?? 0;
        const wordElapsedTime = elapsedTime - wordStartTime;
        if (wordElapsedTime < 0) return;

        const progress = Math.min(1, wordElapsedTime / fadeDuration);
        
        // Active Word Logic
        let isActive = false;
        let activeProgress = 0;
        if (word.duration) {
            isActive = wordElapsedTime >= 0 && wordElapsedTime < word.duration;
            activeProgress = wordElapsedTime / word.duration;
        }

        animateWord(ctx, word, progress, animation, fontString, isActive, activeProgress);
    });
  };

  const animateWord = (
      ctx: CanvasRenderingContext2D, 
      word: Word, 
      progress: number, 
      animation: string, 
      fontString: string,
      isActive: boolean,
      activeProgress: number
  ) => {
    // OPTIMIZATION: Removed redundant context state saves/restores where possible
    
    // Base Animations
    switch(animation) {
        case 'FadeZoom':
            word.alpha = easeOutCubic(progress);
            word.scale = 1 + (0.5 * (1 - easeOutCubic(progress)));
            break;
        case 'DropIn':
            word.alpha = easeOutCubic(progress);
            word.yOffset = -50 * (1 - easeOutCubic(progress));
            break;
        case 'Typewriter':
        default:
            word.alpha = progress >= 0 ? 1 : 0;
            break;
    }
    
    // OVERRIDE: Active Word Kinetic Effect (Bounce & Color)
    let activeScale = 1;
    if (isActive) {
        if (activeProgress < 0.2) {
            activeScale = 1 + (activeProgress * 5) * 0.15; // 0 to 1.15
        } else {
            activeScale = 1.15 - ((activeProgress - 0.2) * 1.25) * 0.15; // 1.15 to 1.0
        }
        activeScale = Math.max(1, activeScale);
    }
    
    const finalScale = word.scale * activeScale;

    ctx.save();
    ctx.globalAlpha = word.alpha;
    ctx.font = fontString; // Set font once per word

    const currentFontSize = parseFloat(fontString) || 32; 
    const fontConfig = { size: currentFontSize, lineHeight: currentFontSize * 1.3 };
    
    const wordWidth = ctx.measureText(word.cleanText).width;
    const x = word.x + wordWidth / 2;
    const y = word.y + fontConfig.lineHeight / 2;
    
    ctx.translate(x, y);
    ctx.scale(finalScale, finalScale);
    
    const wordWiggleX = 0;
    const wordWiggleY = 0;
    
    // Color Selection
    let baseColor = word.isHighlight ? currentTheme.accentColor : currentTheme.baseColor;
    if (isActive) {
        baseColor = currentTheme.highlightColor;
    }
    
    let currentX = -wordWidth / 2;
    let globalCharIndex = 0;

    for (const span of word.spans) {
       let effectiveEffect = span.style.effect;
       const spanColor = isActive ? currentTheme.highlightColor : (span.style.color || baseColor);
       const chars = span.text.split('');

       for (let i = 0; i < chars.length; i++) {
           const char = chars[i];
           const charWidth = ctx.measureText(char).width;
           
           ctx.save();
           
           let charWiggleX = 0;
           let charWiggleY = 0;
           let charScale = 1;
           let charAlpha = 1;
           const time = performance.now();

           if (effectiveEffect === 'wiggle') {
               const intensity = visualStyle === 'Retro' ? 1 : 4;
               charWiggleX = (Math.random() - 0.5) * intensity;
               charWiggleY = (Math.random() - 0.5) * intensity;
           } else if (effectiveEffect === 'glitch') {
               if (Math.random() > 0.9) {
                   charWiggleX = (Math.random() - 0.5) * 10;
                   charAlpha = 0.7;
               }
           } else if (effectiveEffect === 'pulse') {
               charScale = 1 + Math.sin((time / 150) + (globalCharIndex * 0.5)) * 0.3;
           }

           const drawY = -fontConfig.lineHeight / 2 + word.yOffset + wordWiggleY;
           const centerX = currentX + charWidth / 2;

           ctx.translate(centerX, drawY + fontConfig.lineHeight/2);
           ctx.scale(charScale, charScale);
           ctx.translate(-centerX, -(drawY + fontConfig.lineHeight/2));
           
           ctx.globalAlpha = word.alpha * charAlpha;
           
           const drawX = currentX + wordWiggleX + charWiggleX;
           const finalDrawY = drawY + charWiggleY;

           // --- RENDER STYLE LOGIC (OPTIMIZED) ---
           if (textStyle === 'Outline') {
               ctx.strokeStyle = spanColor;
               ctx.lineWidth = currentFontSize * 0.05;
               ctx.strokeText(char, drawX, finalDrawY);
           } else if (textStyle === 'Neon') {
               // Optimized Glow: Reduced Blur and removed secondary stroke
               ctx.shadowBlur = 8; // Reduced from 10
               ctx.shadowColor = spanColor;
               ctx.fillStyle = '#FFFFFF'; 
               ctx.fillText(char, drawX, finalDrawY);
           } else if (textStyle === '3D') {
               ctx.fillStyle = '#333333';
               ctx.fillText(char, drawX + 3, finalDrawY + 3);
               ctx.fillStyle = spanColor;
               ctx.fillText(char, drawX, finalDrawY);
           } else {
               ctx.fillStyle = spanColor;
               ctx.fillText(char, drawX, finalDrawY);
           }
           
           ctx.restore();
           currentX += charWidth;
           globalCharIndex++;
       }
    }

    ctx.restore();
  };

  return (
    <div className="relative w-full aspect-video border border-neutral-800 overflow-hidden" style={{background: 'url(https://www.transparenttextures.com/patterns/dark-matter.png) #000'}}>
       <canvas ref={canvasRef} width={width} height={height} className="w-full h-full object-contain" />
    </div>
  );
};
