
import { GoogleGenAI, Type } from "@google/genai";

const BASE_SYSTEM_PROMPT = `
You are an AI specializing in 'Loyalty Autopsies'. You are a cold-blooded analyst who dissects romantic relationships with brutal logic.

**CRITICAL INSTRUCTIONS:**
1. **Capture the Essence**: Identify the core delusion. What is the user lying to themselves about?
2. **Emphasis**: Select ONE or TWO words that hurt the most and wrap them in asterisks (*). Do NOT wrap the whole sentence.
3. **Tone**: Cynical, dry, clinical. Use economic terms (sunk cost) or evolutionary biology.
4. **Length**: Keep it punchy.

**Goal**: Convert the user's whining into a cold, hard fact.
`;

const KOREAN_RULES = `
**LANGUAGE: KOREAN**
- The output MUST be a grammatically **complete sentence**.
- **NEVER** end with a modifier or incomplete verb form like "한", "인", "의", "던", "는".
- **ALWAYS** end with a noun (e.g., "착각", "전략") or a closing verb (e.g., "이다", "없다", "한다").
- Bad Example: "너라는 변수를 제거한 *" (Incomplete)
- Good Example: "너라는 변수를 제거한 *최적화 과정*이다." (Complete)
`;

const ENGLISH_RULES = `
**LANGUAGE: ENGLISH**
- Output must be in **ENGLISH**.
- Use punchy, subject-verb-object structure.
- Be direct and brutal. 
- Example: "He isn't busy; you are just *irrelevant*."
`;

const TONE_MODIFIERS = {
    Clinical: "Tone: Like a medical examiner. Objective. Use terms like 'symptoms', 'prognosis', 'malignant'. End sentences clearly.",
    Cynical: "Tone: Like a bitter divorce lawyer. Sarcastic but factual. No open-ended thoughts.",
    Brutal: "Tone: Merciless. Destroy the ego. Short, impact-heavy sentences."
};

const LENGTH_MODIFIERS = {
    Short: "Format: A single short sentence (max 15 words). Concise.",
    Medium: "Format: 1-2 sharp sentences. Get to the point.",
    Long: "Format: 2-3 sentences. Analyze, then conclude definitively."
};

const getApiKey = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API_KEY environment variable not set");
    }
    return apiKey;
};

// Helper to fix specific Korean dangling endings if the AI fails
const repairKoreanSentence = (text: string): string => {
    let repaired = text.trim();
    
    // Check for unbalanced asterisks
    const openCount = (repaired.match(/\*/g) || []).length;
    if (openCount % 2 !== 0) {
        // If it ends with a *, remove it. If it started with *, add one at end.
        if (repaired.endsWith('*')) {
            repaired = repaired.slice(0, -1);
        } else {
            // Find the last word and assume it's the highlight
             repaired += '*';
        }
    }

    // Remove markdown bolding of the entire sentence if present
    if (repaired.startsWith('*') && repaired.endsWith('*') && repaired.length > 10) {
         // Strip outer asterisks if they cover the whole text
         repaired = repaired.slice(1, -1);
    }

    // Check for dangling modifiers (modifiers that need a noun)
    const danglingModifiers = ['한', '인', '의', '던', '는', '을', '를'];
    const lastChar = repaired.slice(-1);
    
    // If it ends in a star, check the char before it
    const effectiveLastChar = lastChar === '*' ? repaired.slice(-2, -1) : lastChar;
    
    if (danglingModifiers.includes(effectiveLastChar)) {
        const nounEndings = [" 결과다.", " 상태다.", " 착각이다.", " 전략이다."];
        const randomEnding = nounEndings[Math.floor(Math.random() * nounEndings.length)];
        repaired += (lastChar === '*' ? '' : '') + randomEnding; // Append generic ending
    } else if (!['.', '!', '?', '*', '다', '요', '음', '임'].includes(effectiveLastChar)) {
        // If it doesn't look like a sentence end, force a period.
        if (lastChar !== '*') repaired += ".";
    }

    return repaired;
};

export const generateAutopsyScript = async (
    prompt: string, 
    tone: 'Clinical' | 'Cynical' | 'Brutal',
    scriptLength: 'Short' | 'Medium' | 'Long',
    language: 'Korean' | 'English' = 'Korean'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const finalSystemPrompt = `
    ${BASE_SYSTEM_PROMPT}
    ${language === 'Korean' ? KOREAN_RULES : ENGLISH_RULES}
    **LENGTH DIRECTIVE:** ${LENGTH_MODIFIERS[scriptLength]}
    **TONE DIRECTIVE:** ${TONE_MODIFIERS[tone]}
  `;

  try {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            systemInstruction: finalSystemPrompt,
            temperature: 0.8,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1000, 
        }
    });
    
    let text = response.text;
    if (!text) {
        throw new Error("No text returned from Gemini API");
    }

    // Only apply Korean repair logic if the language is Korean
    if (language === 'Korean') {
        text = repairKoreanSentence(text);
    } else {
        // Simple cleanup for English (ensure no dangling asterisks)
         const openCount = (text.match(/\*/g) || []).length;
         if (openCount % 2 !== 0) text += '*';
    }
    
    // 2. Fallback Highlight Logic: If the AI didn't add asterisks, we add them to a key word.
    if (!text.includes('*')) {
        const words = text.split(' ');
        if (words.length > 2) {
            // Filter out short particles/conjunctions to find a "meaty" word
            const candidates = words.map((w, i) => ({ word: w, index: i }))
                                    .filter(item => item.word.length > 2);
            
            let targetIndex;
            if (candidates.length > 0) {
                // Pick a random substantial word
                targetIndex = candidates[Math.floor(Math.random() * candidates.length)].index;
            } else {
                // Fallback to random middle word
                targetIndex = Math.floor(Math.random() * (words.length - 2)) + 1;
            }

            const targetWord = words[targetIndex];
            
            // Careful punctuation handling
            const match = targetWord.match(/^([^\w\uAC00-\uD7A3]*)([\w\uAC00-\uD7A3]+)([^\w\uAC00-\uD7A3]*)$/);
            
            if (match) {
                const [_, prefix, core, suffix] = match;
                words[targetIndex] = `${prefix}*${core}*${suffix}`;
            } else {
                 words[targetIndex] = `*${targetWord}*`;
            }
            
            return words.join(' ');
        }
    }

    return text.trim();

  } catch (error) {
    console.error("Error calling Gemini API for text generation:", error);
    throw new Error("Failed to communicate with the analysis engine.");
  }
};

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<{ text: string, segments: TranscriptSegment[] }> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    try {
        const audioPart = {
            inlineData: {
                data: audioBase64,
                mimeType,
            },
        };

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                role: "user",
                parts: [
                    audioPart,
                    { text: "Transcribe this audio. Return a JSON object with 'text' (full transcript) and 'segments'. Rules for segments:\n1. The first segment MUST start at 0.00 seconds.\n2. Do NOT leave gaps between segments.\n3. Keep segments VERY short (2-4 words maximum) for kinetic typography.\n4. Timestamps must be extremely precise and match the spoken words exactly to prevent audio drift." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        segments: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: { type: Type.STRING },
                                    start: { type: Type.NUMBER },
                                    end: { type: Type.NUMBER }
                                },
                                required: ["text", "start", "end"]
                            }
                        }
                    },
                    required: ["text", "segments"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) {
            throw new Error("No transcription returned from Gemini API");
        }
        
        const result = JSON.parse(jsonText);
        
        // Validation ensuring we have segments
        if (!result.segments || !Array.isArray(result.segments)) {
            // Fallback if model fails to generate segments properly
            return {
                text: result.text || jsonText,
                segments: []
            };
        }

        return {
            text: result.text,
            segments: result.segments
        };
    } catch (error) {
        console.error("Error calling Gemini API for audio transcription:", error);
        throw new Error("Failed to transcribe the audio file.");
    }
};
