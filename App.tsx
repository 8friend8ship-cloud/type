
import React, { useState, useCallback, useRef } from 'react';
import { InputForm } from './components/InputForm';
import { KineticTypographyPlayer } from './components/KineticTypographyPlayer';
import { generateAutopsyScript, TranscriptSegment } from './services/geminiService';

type AppState = 'IDLE' | 'ANALYZING' | 'PREVIEW' | 'GENERATING' | 'COMPLETE';
export type AutopsyMode = 'summarize' | 'literal';

export type BackgroundType = 'solid' | 'transparent' | 'image' | 'video';

export type AutopsyOptions = {
  language: 'Korean' | 'English';
  tone: 'Clinical' | 'Cynical' | 'Brutal';
  fontSize: 'Small' | 'Medium' | 'Large';
  animation: 'Typewriter' | 'FadeZoom' | 'DropIn';
  scriptLength: 'Short' | 'Medium' | 'Long';
  visualStyle: 'Minimalist' | 'Glitchy' | 'Retro';
  textStyle: 'Fill' | 'Outline' | 'Neon' | '3D';
  fontFamily: 'Sans' | 'Serif' | 'Handwritten' | 'Round' | 'Dongle' | 'Pen';
  fontWeight: 'Light' | 'Normal' | 'Bold';
  backgroundType: BackgroundType;
  backgroundSource: string;
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [options, setOptions] = useState<AutopsyOptions>({
    language: 'Korean',
    tone: 'Cynical',
    fontSize: 'Medium',
    animation: 'Typewriter',
    scriptLength: 'Medium',
    visualStyle: 'Glitchy',
    textStyle: 'Fill',
    fontFamily: 'Round',
    fontWeight: 'Normal',
    backgroundType: 'solid',
    backgroundSource: '#000000',
  });
  
  // Ref for file input in Preview mode
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[] | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrlForPlayer, setAudioUrlForPlayer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<AutopsyMode>('summarize');
  const [generationProgress, setGenerationProgress] = useState(0);

  const handleAutopsyStart = useCallback(async (
    concern: string, 
    currentOptions: AutopsyOptions, 
    mode: AutopsyMode,
    audioBlob?: Blob,
    segments?: TranscriptSegment[]
  ) => {
    setOptions(currentOptions);
    setAppState('ANALYZING');
    setGeneratedScript('');
    setTranscriptSegments(undefined);
    setVideoUrl(null);
    setAudioUrlForPlayer(null);
    setError(null);
    setCurrentMode(mode);

    try {
      let script: string;
      if (mode === 'summarize') {
        script = await generateAutopsyScript(
            concern, 
            currentOptions.tone, 
            currentOptions.scriptLength, 
            currentOptions.language
        );
      } else {
        script = concern;
        if (audioBlob) {
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioUrlForPlayer(audioUrl);
        }
        if (segments) {
            setTranscriptSegments(segments);
        }
      }
      setGeneratedScript(script);
      setAppState('PREVIEW');
    } catch (err) {
      console.error('Error during autopsy process:', err);
      setError('오류가 발생했습니다. 콘솔을 확인하고 다시 시도해주세요.');
      setAppState('IDLE');
    }
  }, []);

  const handleGenerateVideo = useCallback(() => {
    setGenerationProgress(0);
    setAppState('GENERATING');
  }, []);

  const handleVideoGenerationComplete = useCallback((url: string) => {
    setVideoUrl(url);
    setAppState('COMPLETE');
  }, []);

  const handleProgress = useCallback((progress: number) => {
    setGenerationProgress(progress);
  }, []);
  
  const handleGenerationError = useCallback((errorMessage: string) => {
    console.error("Video Generation Error:", errorMessage);
    setError(`영상 생성 실패: ${errorMessage}`);
    setAppState('IDLE');
  }, []);

  const handleReset = useCallback(() => {
    setAppState('IDLE');
    setGeneratedScript('');
    setTranscriptSegments(undefined);
    setError(null);
    // Note: We don't reset options completely so user keeps their preferences
    setVideoUrl(currentUrl => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
    });
    setAudioUrlForPlayer(currentUrl => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
    });
  }, []);

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

      setOptions(prev => ({
          ...prev,
          backgroundType: newType,
          backgroundSource: url
      }));
  };
  
  const GlitchTitle = () => (
    <div className="relative group cursor-default">
      <h1 className="text-4xl md:text-6xl font-mono font-bold text-neutral-200 transition-opacity duration-300 group-hover:opacity-20">
        LOYALTY AUTOPSY
      </h1>
      <h1
        aria-hidden="true"
        className="text-4xl md:text-6xl font-mono font-bold text-red-500 absolute top-0 left-0 w-full h-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 animate-glitch-1"
      >
        LOYALTY AUTOPSY
      </h1>
      <h1
        aria-hidden="true"
        className="text-4xl md:text-6xl font-mono font-bold text-blue-500 absolute top-0 left-0 w-full h-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 animate-glitch-2"
      >
        LOYALTY AUTOPSY
      </h1>
    </div>
  );

  return (
    <div className="bg-black text-neutral-200 min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <style>{`
        @keyframes glitch-1 {
          0%, 100% { clip-path: inset(50% 0 30% 0); }
          20% { clip-path: inset(80% 0 10% 0); }
          40% { clip-path: inset(20% 0 70% 0); }
          60% { clip-path: inset(40% 0 40% 0); }
          80% { clip-path: inset(90% 0 5% 0); }
        }
        .animate-glitch-1 { animation: glitch-1 1s infinite alternate-reverse; }
        
        @keyframes glitch-2 {
          0%, 100% { clip-path: inset(10% 0 80% 0); }
          20% { clip-path: inset(30% 0 50% 0); }
          40% { clip-path: inset(60% 0 20% 0); }
          60% { clip-path: inset(15% 0 75% 0); }
          80% { clip-path: inset(45% 0 35% 0); }
        }
        .animate-glitch-2 { animation: glitch-2 1.5s infinite alternate-reverse; }
      `}</style>

      <div className="w-full max-w-3xl mx-auto text-center space-y-8">
        <header className="mb-8">
          <GlitchTitle />
          <p className="text-neutral-400 font-mono mt-2">팩트로 로맨스를 말려버립니다.</p>
        </header>

        <main className="w-full">
          {appState === 'IDLE' && <InputForm onStart={handleAutopsyStart} initialOptions={options} />}
          
          {appState === 'ANALYZING' && (
             <div className="flex flex-col items-center justify-center h-64 w-full border border-neutral-800 bg-neutral-900/30 p-8 rounded-md backdrop-blur-sm animate-fade-in">
                <div className="w-12 h-12 border-4 border-neutral-800 border-t-red-600 rounded-full animate-spin mb-6"></div>
                <p className="font-mono text-xl text-red-500 animate-pulse uppercase tracking-widest">
                  {currentMode === 'summarize' ? '감정 분석 중' : '오디오 변환 중'}
                </p>
             </div>
          )}

          {appState === 'PREVIEW' && (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-neutral-900 border border-neutral-700 p-4 sm:p-6 text-left">
                    <h3 className="text-red-500 font-mono text-xl mb-4 uppercase border-b border-neutral-800 pb-2">I. 사건 조사 결과 (스크립트)</h3>
                    <textarea 
                        value={generatedScript}
                        onChange={(e) => setGeneratedScript(e.target.value)}
                        className="w-full h-32 bg-black border border-neutral-700 text-neutral-200 p-3 font-mono focus:border-red-500 focus:outline-none"
                    />
                </div>

                <div className="bg-neutral-900 border border-neutral-700 p-4 sm:p-6 text-left">
                    <h3 className="text-red-500 font-mono text-xl mb-4 uppercase border-b border-neutral-800 pb-2">II. 시각적 증거 (미리보기)</h3>
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-1/2 flex items-center justify-center aspect-video relative overflow-hidden border border-neutral-800" style={{background: 'url(https://www.transparenttextures.com/patterns/dark-matter.png) #111'}}>
                             <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-xs font-mono pointer-events-none z-0">
                                배경 미리보기
                             </div>
                            <KineticTypographyPlayer
                                script="PREVIEW *STYLE*" 
                                onComplete={() => {}}
                                width={300}
                                height={169}
                                fontSize={options.fontSize}
                                animation={options.animation}
                                visualStyle={options.visualStyle}
                                textStyle={options.textStyle}
                                fontFamily={options.fontFamily}
                                fontWeight={options.fontWeight}
                                isPreviewMode={true}
                                backgroundType={options.backgroundType}
                                backgroundSource={options.backgroundSource}
                            />
                        </div>
                        <div className="w-full md:w-1/2 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-neutral-500 font-mono text-xs mb-1">비주얼 테마</label>
                                    <select 
                                        value={options.visualStyle}
                                        onChange={(e) => setOptions({...options, visualStyle: e.target.value as any})}
                                        className="w-full bg-neutral-800 text-white font-mono text-sm p-2 border border-neutral-600"
                                    >
                                        <option value="Minimalist">미니멀</option>
                                        <option value="Glitchy">글리치</option>
                                        <option value="Retro">레트로</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-500 font-mono text-xs mb-1">텍스트 스타일</label>
                                    <select 
                                        value={options.textStyle}
                                        onChange={(e) => setOptions({...options, textStyle: e.target.value as any})}
                                        className="w-full bg-neutral-800 text-white font-mono text-sm p-2 border border-neutral-600"
                                    >
                                        <option value="Fill">기본 (채우기)</option>
                                        <option value="Outline">외곽선</option>
                                        <option value="Neon">네온</option>
                                        <option value="3D">3D 입체</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-500 font-mono text-xs mb-1">애니메이션</label>
                                    <select 
                                        value={options.animation}
                                        onChange={(e) => setOptions({...options, animation: e.target.value as any})}
                                        className="w-full bg-neutral-800 text-white font-mono text-sm p-2 border border-neutral-600"
                                    >
                                        <option value="Typewriter">타자기</option>
                                        <option value="FadeZoom">페이드 & 줌</option>
                                        <option value="DropIn">드롭 인</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-500 font-mono text-xs mb-1">글꼴</label>
                                    <select 
                                        value={options.fontFamily}
                                        onChange={(e) => setOptions({...options, fontFamily: e.target.value as any})}
                                        className="w-full bg-neutral-800 text-white font-mono text-sm p-2 border border-neutral-600"
                                    >
                                        <option value="Sans">고딕</option>
                                        <option value="Serif">명조</option>
                                        <option value="Round">주아 (둥근)</option>
                                        <option value="Dongle">동글 (귀염)</option>
                                        <option value="Handwritten">개구쟁이</option>
                                        <option value="Pen">손글씨 펜</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-700 p-4 sm:p-6 text-left">
                    <h3 className="text-red-500 font-mono text-xl mb-4 uppercase border-b border-neutral-800 pb-2">III. 배경 설정 (Background)</h3>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="flex items-center gap-2 bg-neutral-800 p-1 rounded-md">
                            <button
                                onClick={() => setOptions(p => ({...p, backgroundType: 'solid'}))}
                                className={`px-3 py-1 text-sm font-mono rounded ${options.backgroundType === 'solid' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                            >
                                단색
                            </button>
                            <button
                                onClick={() => setOptions(p => ({...p, backgroundType: 'transparent'}))}
                                className={`px-3 py-1 text-sm font-mono rounded ${options.backgroundType === 'transparent' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                            >
                                투명
                            </button>
                            <button
                                onClick={() => bgFileInputRef.current?.click()}
                                className={`px-3 py-1 text-sm font-mono rounded ${options.backgroundType === 'image' || options.backgroundType === 'video' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                            >
                                이미지/영상 업로드
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
                             <div className="flex items-center gap-2">
                                <label className="text-neutral-500 font-mono text-sm">색상:</label>
                                <input 
                                    type="color" 
                                    value={options.backgroundSource} 
                                    onChange={(e) => setOptions(p => ({...p, backgroundSource: e.target.value}))}
                                    className="h-8 w-16 bg-transparent cursor-pointer"
                                />
                             </div>
                        )}
                        
                        {(options.backgroundType === 'image' || options.backgroundType === 'video') && (
                            <span className="text-neutral-400 font-mono text-xs truncate max-w-[200px]">
                                {options.backgroundType === 'image' ? '이미지' : '영상'} 로드됨
                            </span>
                        )}
                        {options.backgroundType === 'transparent' && (
                             <span className="text-neutral-400 font-mono text-xs">
                                * 투명 배경은 .MOV 다운로드 시 적용됩니다.
                             </span>
                        )}
                    </div>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={handleReset}
                        className="flex-1 font-mono bg-transparent border border-neutral-600 text-neutral-400 py-4 hover:bg-neutral-800 transition-colors"
                    >
                        폐기 및 재시작
                    </button>
                    <button 
                        onClick={handleGenerateVideo}
                        className="flex-[2] font-mono bg-red-600 text-white py-4 hover:bg-red-700 transition-transform transform hover:scale-[1.02]"
                    >
                        확인 및 비디오 생성
                    </button>
                </div>
            </div>
          )}

          {appState === 'GENERATING' && generatedScript && (
            <div className="text-center w-full max-w-4xl animate-fade-in">
              <div className="flex flex-col items-center justify-center gap-4 mb-4">
                 <div className="flex items-center gap-3">
                     <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                     <p className="font-mono text-lg animate-pulse text-red-500 tracking-widest">최종 부검 보고서 생성 중...</p>
                 </div>
                 
                 <div className="w-full max-w-md bg-neutral-800 h-2 rounded-full overflow-hidden border border-neutral-700">
                    <div 
                        className="h-full bg-red-600 transition-all duration-300 ease-out"
                        style={{ width: `${generationProgress}%` }}
                    ></div>
                 </div>
                 <p className="font-mono text-sm text-neutral-400">{generationProgress}% 완료</p>
              </div>
               <KineticTypographyPlayer
                script={generatedScript}
                onComplete={handleVideoGenerationComplete}
                onProgress={handleProgress}
                onError={handleGenerationError}
                transcriptSegments={transcriptSegments}
                width={800}
                height={450}
                fontSize={options.fontSize}
                animation={options.animation}
                audioSrc={audioUrlForPlayer}
                visualStyle={options.visualStyle}
                textStyle={options.textStyle}
                fontFamily={options.fontFamily}
                fontWeight={options.fontWeight}
                backgroundType={options.backgroundType}
                backgroundSource={options.backgroundSource}
              />
            </div>
          )}

          {appState === 'COMPLETE' && videoUrl && (
            <div className="space-y-6">
              <h2 className="text-2xl font-mono text-red-500">부검 완료</h2>
              <video src={videoUrl} controls className="w-full rounded-md border border-neutral-700" style={options.backgroundType === 'transparent' ? {backgroundImage: 'url(https://www.transparenttextures.com/patterns/dark-matter.png)'} : {}}></video>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a 
                  href={videoUrl} 
                  download={`loyalty_autopsy_${Date.now()}.webm`}
                  className="w-full sm:w-auto font-mono bg-neutral-200 text-black px-6 py-3 rounded-none hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white transition-all transform hover:scale-105"
                >
                  .WEBM 다운로드
                </a>
                <a 
                  href={videoUrl} 
                  download={`loyalty_autopsy_${Date.now()}.mov`}
                  className="w-full sm:w-auto font-mono bg-blue-600 text-white px-6 py-3 rounded-none hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-blue-600 transition-all transform hover:scale-105"
                  title="고화질/알파채널 포함 (ProRes 4444 스타일)"
                >
                  .MOV (ProRes 4444 스타일*)
                </a>
              </div>
              <div className="text-center">
                 <p className="text-xs text-neutral-500 font-mono mt-2">* ProRes 4444 스타일: 알파 채널을 지원하는 고화질(25Mbps) VP9 코덱을 MOV 컨테이너로 저장합니다.</p>
                 <button 
                  onClick={handleReset}
                  className="mt-6 w-full sm:w-auto font-mono bg-transparent border border-neutral-700 text-neutral-400 px-6 py-3 rounded-none hover:bg-neutral-900 hover:text-white transition-all"
                >
                  새로운 부검
                </button>
              </div>
            </div>
          )}
          
          {error && <p className="text-red-500 font-mono mt-4">{error}</p>}
        </main>
      </div>
    </div>
  );
}
