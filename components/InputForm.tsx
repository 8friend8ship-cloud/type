
import React, { useState, useRef, useCallback } from 'react';
import { AutopsyOptions, AutopsyMode, BackgroundType } from '../App';
import { transcribeAudio, TranscriptSegment } from '../services/geminiService';

interface InputFormProps {
  onStart: (concern: string, options: AutopsyOptions, mode: AutopsyMode, audioBlob?: Blob, segments?: TranscriptSegment[]) => void;
  initialOptions: AutopsyOptions;
}

interface OptionGroupProps {
  label: string;
  children: React.ReactNode;
}

const OptionGroup: React.FC<OptionGroupProps> = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-0">
    <label className="font-mono text-neutral-400 text-sm whitespace-nowrap min-w-[100px]">{label}</label>
    <div className="flex flex-wrap items-center gap-2 p-1 bg-neutral-800 rounded-md w-full sm:w-auto justify-start sm:justify-end">{children}</div>
  </div>
);

interface OptionButtonProps {
  label: string;
  name: string;
  value: string;
  isSelected: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const OptionButton: React.FC<OptionButtonProps> = ({ label, name, value, isSelected, onChange }) => (
  <label className={`font-mono text-xs sm:text-sm px-3 py-1 cursor-pointer rounded-md transition-all border border-transparent ${isSelected ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-700 hover:border-neutral-600'}`}>
    <input type="radio" name={name} value={value} checked={isSelected} onChange={onChange} className="sr-only" />
    {label}
  </label>
);

const EXAMPLE_PROMPTS = [
  "3시간 동안 읽씹당했어. 우리 미래를 계획하느라 바쁜 게 분명해.",
  "그 사람은 내 인스타 스토리를 항상 첫번째로 봐. 이건 운명이야.",
  "눈이 0.7초 마주쳤어. 전생부터 이어진 깊은 연결감을 느꼈지.",
  "답장이 늦는 걸 보니, 나에게 쓸 최고의 문장을 고민하고 있는 게 틀림없어.",
];

const LABELS = {
    lang: { Korean: '한국어', English: 'English' },
    tone: { Clinical: '임상적', Cynical: '냉소적', Brutal: '가혹함' },
    length: { Short: '짧게', Medium: '보통', Long: '길게' },
    style: { Minimalist: '미니멀', Glitchy: '글리치', Retro: '레트로' },
    textStyle: { Fill: '기본', Outline: '외곽선', Neon: '네온', '3D': '3D' },
    font: { Sans: '고딕 (기본)', Serif: '명조 (진지)', Round: '주아 (둥근)', Dongle: '동글 (귀염)', Handwritten: '개구쟁이', Pen: '손글씨 펜' },
    weight: { Light: '얇게', Normal: '보통', Bold: '굵게' },
    size: { Small: '작게', Medium: '보통', Large: '크게' },
    anim: { Typewriter: '타자기', FadeZoom: '페이드&줌', DropIn: '낙하' }
};

export const InputForm: React.FC<InputFormProps> = ({ onStart, initialOptions }) => {
  const [mode, setMode] = useState<AutopsyMode>('summarize');
  const [concern, setConcern] = useState('');
  const [options, setOptions] = useState<AutopsyOptions>(initialOptions);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[] | undefined>(undefined);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const handleOptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setOptions(prev => ({ ...prev, [name]: value }));
  };
  
  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      
      let newType: BackgroundType = 'image';
      if (file.type.startsWith('video/')) {
          newType = 'video';
      } else if (file.type.startsWith('image/')) {
          newType = 'image';
      }
      setOptions(prev => ({ ...prev, backgroundType: newType, backgroundSource: url }));
  };

  const processAudioBlob = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setTranscriptionError(null);
    audioBlobRef.current = blob;
    setTranscriptSegments(undefined);

    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const base64String = (event.target?.result as string).split(',')[1];
                if (!base64String) throw new Error("파일 데이터를 읽을 수 없습니다.");
                
                const { text, segments } = await transcribeAudio(base64String, blob.type);
                setConcern(text);
                setTranscriptSegments(segments);
            } catch (err) {
                console.error(err);
                setTranscriptionError(err instanceof Error ? err.message : "변환에 실패했습니다.");
            } finally {
                setIsTranscribing(false);
            }
        };
        reader.onerror = () => {
            setTranscriptionError("오디오 파일을 읽는데 실패했습니다.");
            setIsTranscribing(false);
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error(err);
        setTranscriptionError("파일 처리 중 오류가 발생했습니다.");
        setIsTranscribing(false);
    }
  }, []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAudioBlob(file);
  };

  const startRecording = async () => {
    setTranscriptionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        processAudioBlob(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

    } catch (err) {
      console.error("Error starting recording:", err);
      setTranscriptionError("마이크에 접근할 수 없습니다. 권한을 확인해주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMicButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const canSubmitSummarize = mode === 'summarize' && concern.trim();
    const canSubmitLiteral = mode === 'literal' && concern.trim() && audioBlobRef.current;
    
    if (!isTranscribing && !isRecording && (canSubmitSummarize || canSubmitLiteral)) {
      onStart(concern.trim(), options, mode, audioBlobRef.current ?? undefined, transcriptSegments);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
       <div className="flex items-center gap-2 p-1 bg-neutral-800 rounded-md max-w-sm mx-auto">
        <button
            type="button"
            onClick={() => setMode('summarize')}
            className={`w-1/2 font-mono text-sm py-2 rounded-md transition-all ${mode === 'summarize' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-700'}`}
        >
            텍스트 분석
        </button>
        <button
            type="button"
            onClick={() => setMode('literal')}
            className={`w-1/2 font-mono text-sm py-2 rounded-md transition-all ${mode === 'literal' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-700'}`}
        >
            음성 애니메이션
        </button>
      </div>

      <div className="space-y-4 p-4 border border-neutral-800 bg-neutral-900/50">
        {mode === 'summarize' ? (
          <>
            <OptionGroup label="언어 (Language)">
              {(['Korean', 'English'] as const).map(lang => (
                <OptionButton key={lang} label={LABELS.lang[lang]} name="language" value={lang} isSelected={options.language === lang} onChange={handleOptionChange} />
              ))}
            </OptionGroup>
            <OptionGroup label="분석 어조">
              {(['Clinical', 'Cynical', 'Brutal'] as const).map(tone => (
                <OptionButton key={tone} label={LABELS.tone[tone]} name="tone" value={tone} isSelected={options.tone === tone} onChange={handleOptionChange} />
              ))}
            </OptionGroup>
             <OptionGroup label="스크립트 길이">
              {(['Short', 'Medium', 'Long'] as const).map(len => (
                <OptionButton key={len} label={LABELS.length[len]} name="scriptLength" value={len} isSelected={options.scriptLength === len} onChange={handleOptionChange} />
              ))}
            </OptionGroup>
          </>
        ) : (
            <div className="font-mono text-center text-neutral-400 text-sm space-y-2">
                <p>음성을 있는 그대로 텍스트로 변환하여 애니메이션화합니다.</p>
                <p className="text-red-500 font-bold text-xs">* 영상 생성 시간은 오디오 파일의 길이와 동일하게 소요됩니다. (예: 3분 오디오 = 3분 소요)</p>
            </div>
        )}
        <OptionGroup label="비주얼 스타일">
          {(['Minimalist', 'Glitchy', 'Retro'] as const).map(style => (
            <OptionButton key={style} label={LABELS.style[style]} name="visualStyle" value={style} isSelected={options.visualStyle === style} onChange={handleOptionChange} />
          ))}
        </OptionGroup>

        <OptionGroup label="텍스트 스타일">
          {(['Fill', 'Outline', 'Neon', '3D'] as const).map(style => (
            <OptionButton key={style} label={LABELS.textStyle[style]} name="textStyle" value={style} isSelected={options.textStyle === style} onChange={handleOptionChange} />
          ))}
        </OptionGroup>
        
        <OptionGroup label="글꼴">
          {(['Sans', 'Serif', 'Round', 'Dongle', 'Handwritten', 'Pen'] as const).map(font => (
            <OptionButton key={font} label={LABELS.font[font]} name="fontFamily" value={font} isSelected={options.fontFamily === font} onChange={handleOptionChange} />
          ))}
        </OptionGroup>

        <OptionGroup label="글자 굵기">
          {(['Light', 'Normal', 'Bold'] as const).map(weight => (
            <OptionButton key={weight} label={LABELS.weight[weight]} name="fontWeight" value={weight} isSelected={options.fontWeight === weight} onChange={handleOptionChange} />
          ))}
        </OptionGroup>

        <OptionGroup label="글자 크기">
          {(['Small', 'Medium', 'Large'] as const).map(size => (
            <OptionButton key={size} label={LABELS.size[size]} name="fontSize" value={size} isSelected={options.fontSize === size} onChange={handleOptionChange} />
          ))}
        </OptionGroup>
        <OptionGroup label="애니메이션">
          {(['Typewriter', 'FadeZoom', 'DropIn'] as const).map(anim => (
            <OptionButton key={anim} label={LABELS.anim[anim]} name="animation" value={anim} isSelected={options.animation === anim} onChange={handleOptionChange} />
          ))}
        </OptionGroup>
        
        {/* NEW: Background Settings in Input Form */}
        <OptionGroup label="배경 설정">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOptions(prev => ({ ...prev, backgroundType: 'solid' }))}
                    className={`font-mono text-xs px-2 py-1 rounded ${options.backgroundType === 'solid' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white border border-neutral-700'}`}
                >
                    단색
                </button>
                <button
                    type="button"
                    onClick={() => setOptions(prev => ({ ...prev, backgroundType: 'transparent' }))}
                    className={`font-mono text-xs px-2 py-1 rounded ${options.backgroundType === 'transparent' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white border border-neutral-700'}`}
                >
                    투명
                </button>
                <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className={`font-mono text-xs px-2 py-1 rounded ${options.backgroundType === 'image' || options.backgroundType === 'video' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white border border-neutral-700'}`}
                >
                    업로드
                </button>
                <input 
                    type="file" 
                    ref={bgFileInputRef}
                    onChange={handleBgFileChange} 
                    accept="image/*,video/*"
                    className="hidden"
                />
            </div>
             {options.backgroundType === 'solid' && (
                <div className="flex items-center ml-2">
                    <input 
                        type="color" 
                        value={options.backgroundSource} 
                        onChange={(e) => setOptions(prev => ({ ...prev, backgroundSource: e.target.value }))}
                        className="h-6 w-8 bg-transparent cursor-pointer border border-neutral-700"
                    />
                </div>
            )}
        </OptionGroup>
      </div>
      
      <div className="relative">
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          placeholder={mode === 'summarize' ? "당신의 낭만적인 망상을 여기에 서술하세요..." : "음성 변환 내용이 여기에 표시됩니다. 녹음하거나 파일을 업로드하세요."}
          className="w-full h-40 p-4 pr-24 bg-neutral-900 border border-neutral-700 text-neutral-200 font-mono placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none transition-all"
          required
          disabled={isTranscribing || isRecording || mode === 'literal'}
        />
        
        {/* Loading Overlay */}
        {isTranscribing && (
          <div className="absolute inset-0 bg-neutral-900/90 z-10 flex flex-col items-center justify-center backdrop-blur-sm border border-neutral-700">
             <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-3"></div>
             <p className="font-mono text-red-500 animate-pulse text-sm">오디오 변환 중...</p>
             <p className="font-mono text-neutral-500 text-xs mt-2">잠시만 기다려주세요</p>
          </div>
        )}

        <input type="file" ref={fileInputRef} onChange={handleAudioUpload} accept="audio/*" className="sr-only" />
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
           <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isTranscribing || isRecording}
              className="text-neutral-500 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Upload audio file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleMicButtonClick}
              disabled={isTranscribing}
              className={`text-neutral-500 hover:text-white transition-colors disabled:opacity-50 ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
        </div>
      </div>
      
      {mode === 'summarize' && (
      <div className="pt-2 text-center">
        <p className="font-mono text-sm text-neutral-500 mb-3">
            또는 예시 선택:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
            {EXAMPLE_PROMPTS.map((prompt, index) => (
            <button
                key={index}
                type="button"
                onClick={() => setConcern(prompt)}
                className="font-mono text-xs text-neutral-400 bg-neutral-800 px-3 py-1 rounded-full hover:bg-neutral-700 hover:text-white transition-colors"
                aria-label={`Select example prompt: ${prompt}`}
            >
                "{prompt.length > 20 ? `${prompt.substring(0, 18)}...` : prompt}"
            </button>
            ))}
        </div>
      </div>
      )}
      
      {isRecording && <p className="font-mono text-center text-neutral-400">녹음 중... 마이크를 눌러 중지하세요.</p>}
      {transcriptionError && <p className="font-mono text-center text-red-500">{transcriptionError}</p>}
      
      <button 
        type="submit"
        disabled={ (mode === 'summarize' && !concern.trim()) || (mode === 'literal' && !audioBlobRef.current) || isTranscribing || isRecording }
        className="w-full font-mono text-lg bg-red-600 text-white px-8 py-4 rounded-none hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-red-500 disabled:bg-neutral-700 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {isTranscribing ? '변환 중...' : '분석 및 미리보기'}
      </button>
    </form>
  );
};
