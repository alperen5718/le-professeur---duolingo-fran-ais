import React, { useState, useEffect, useCallback } from 'react';
import { 
  BookOpen, 
  Trophy, 
  Zap, 
  ChevronRight, 
  Check, 
  X, 
  RefreshCcw,
  ArrowLeft,
  Languages,
  HelpCircle,
  AlertCircle,
  Lightbulb,
  BrainCircuit,
  Home,
  Library,
  Loader2,
  Sparkles,
  SkipForward,
  Gamepad2
} from 'lucide-react';
import { Lesson, UserState, Level, Exercise, ExerciseType, Vocabulary } from './types';
import { INITIAL_XP, INITIAL_STREAK, INITIAL_LEVEL } from './constants';
import { generateLesson, evaluatePronunciation, generateRemedialContent } from './services/geminiService';
import AudioPlayer from './components/AudioPlayer';
import VoiceInput from './components/VoiceInput';
import MiniGame from './components/MiniGame';
import ChatBot from './components/ChatBot';
import WordRainGame from './components/WordRainGame';

const INITIAL_STATE: UserState = {
    xp: INITIAL_XP,
    streak: INITIAL_STREAK,
    level: INITIAL_LEVEL,
    history: [],
    weakAreas: [],
    learnedVocabulary: []
};

const LOADING_MESSAGES = [
    "Ders içeriği hazırlanıyor...",
    "Fransızca öğretmeniniz notlarını karıştırıyor...",
    "Kelimeler seçiliyor...",
    "Egzersizler kurgulanıyor...",
    "Kahve molası bitti, başlıyoruz...",
    "Yapay zeka kelimeleri eşleştiriyor..."
];

const App: React.FC = () => {
  // --- State ---
  const [userState, setUserState] = useState<UserState>(INITIAL_STATE);
  
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [lessonStep, setLessonStep] = useState(0); // 0: Intro, 1..n: Content, Last: Summary
  const [feedback, setFeedback] = useState<{type: 'success'|'error'|'info', msg: string} | null>(null);
  const [userInputText, setUserInputText] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [activeTab, setActiveTab] = useState<'lessons' | 'memory'>('lessons');
  const [isPlayingArcade, setIsPlayingArcade] = useState(false);
  
  // Error handling & Adaptive Learning state
  const [mistakeCount, setMistakeCount] = useState(0);
  const [remedialContent, setRemedialContent] = useState<string | null>(null);
  const [isRemedialLoading, setIsRemedialLoading] = useState(false);

  // --- Effects ---

  // Load from LocalStorage on mount
  useEffect(() => {
      const saved = localStorage.getItem('leProfesseurState');
      if (saved) {
          try {
              setUserState(JSON.parse(saved));
          } catch (e) {
              console.error("Failed to parse saved state");
          }
      }
  }, []);

  // Save to LocalStorage on change
  useEffect(() => {
      localStorage.setItem('leProfesseurState', JSON.stringify(userState));
  }, [userState]);

  // Cycle loading messages
  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;
      if (isLoading) {
          interval = setInterval(() => {
              setLoadingMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
          }, 2000);
      }
      return () => clearInterval(interval);
  }, [isLoading]);

  // --- Actions ---

  const startLesson = async (topic: string) => {
    setIsLoading(true);
    setLoadingMessageIndex(0);
    setFeedback(null);
    setMistakeCount(0);
    setRemedialContent(null);
    
    // Pass weak areas to generate adaptive lesson with spaced repetition
    const lesson = await generateLesson(topic, userState.level, userState.weakAreas);
    
    if (lesson) {
      setCurrentLesson(lesson);
      setLessonStep(0);
    } else {
      setFeedback({ type: 'error', msg: 'Ders oluşturulurken bir hata oluştu. Lütfen tekrar dene.' });
    }
    setIsLoading(false);
  };

  const saveLearnedContent = () => {
    if (!currentLesson) return;
    
    setUserState(prev => {
        // Avoid duplicates
        const newVocab = currentLesson.vocabulary.filter(
            newItem => !prev.learnedVocabulary.some(existing => existing.fr === newItem.fr)
        );
        
        return {
            ...prev,
            learnedVocabulary: [...prev.learnedVocabulary, ...newVocab]
        };
    });
  };

  const handleNextStep = () => {
    setFeedback(null);
    setUserInputText('');
    setShowTranslation(false);
    setMistakeCount(0);
    setRemedialContent(null);
    
    if (currentLesson) {
        setLessonStep(prev => prev + 1);
    }
  };

  const handleSkipExercise = () => {
      // Trigger next step without awarding points
      // Optional: Could track this as a 'weak area' implicitly if needed in future
      handleNextStep();
  };

  const finishLesson = () => {
      saveLearnedContent();
      setCurrentLesson(null);
      setLessonStep(0);
  };

  /**
   * ROBUST NORMALIZATION FUNCTION
   * Handles accents (e.g., "à" -> "a") and removes ALL punctuation
   */
  const normalizeText = (str: string) => {
      return String(str)
        .normalize("NFD") // Decompose accents (e = e + ´)
        .replace(/[\u0300-\u036f]/g, "") // Remove accent marks
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "") // Remove ANYTHING that is not a letter, number, or space (removes . , ! ? - etc)
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
  };

  const handleExerciseSubmit = async (exercise: Exercise, answer: string) => {
    const correctAnswers = exercise.correct_answers || [];
    
    const normalizedUser = normalizeText(answer);
    
    // Check against all possible correct answers
    const isCorrect = correctAnswers.some(a => normalizeText(a) === normalizedUser);
    
    if (isCorrect) {
      setFeedback({ type: 'success', msg: exercise.tutor_feedback.on_correct });
      setUserState(prev => ({ ...prev, xp: prev.xp + 10 }));
      const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
      audio.volume = 0.2;
      audio.play().catch(() => {});
      setRemedialContent(null);
    } else {
      const newCount = mistakeCount + 1;
      setMistakeCount(newCount);
      
      // --- Adaptive Logic: If 2 mistakes, trigger Remedial Mini-Lesson ---
      if (newCount === 2) {
        setIsRemedialLoading(true);
        
        setUserState(prev => {
            const identifier = exercise.prompt_fr; 
            if (!prev.weakAreas.includes(identifier)) {
                return { ...prev, weakAreas: [...prev.weakAreas, identifier] };
            }
            return prev;
        });

        const miniLesson = await generateRemedialContent(
            exercise.prompt_fr,
            answer,
            correctAnswers[0] || ""
        );
        setRemedialContent(miniLesson);
        setIsRemedialLoading(false);
      }

      setFeedback({ type: 'error', msg: exercise.tutor_feedback.on_incorrect });
    }
  };

  const handlePronunciationCheck = async (exercise: Exercise, transcript: string) => {
    if (!exercise.pronunciation_check) return;
    
    // Visual feedback that processing is happening
    const normalizedTranscript = normalizeText(transcript);
    const normalizedExpected = normalizeText(exercise.pronunciation_check.expected_text);
    
    // Optimistic check: if simple text match works, skip API call to save time
    if (normalizedTranscript === normalizedExpected) {
        setFeedback({ type: 'success', msg: "Mükemmel telaffuz! (+20 Puan)" });
        setUserState(prev => ({ ...prev, xp: prev.xp + 20 }));
        return;
    }

    setIsLoading(true);
    const evaluation = await evaluatePronunciation(exercise.pronunciation_check.expected_text, transcript);
    setIsLoading(false);

    if (evaluation.score > 70) {
      setFeedback({ type: 'success', msg: `${evaluation.feedback} (+${evaluation.score} Puan)` });
      setUserState(prev => ({ ...prev, xp: prev.xp + Math.round(evaluation.score / 5) }));
    } else {
      setFeedback({ type: 'error', msg: evaluation.feedback });
    }
  };

  const closeRemedialModal = () => {
      setRemedialContent(null);
      setMistakeCount(1); 
  };

  // --- Render Helpers ---

  const renderLoadingScreen = () => (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-50 p-4">
          <div className="relative mb-8">
              <div className="absolute inset-0 bg-indigo-300 rounded-full opacity-20 animate-ping"></div>
              <div className="bg-white p-6 rounded-full shadow-xl relative z-10 animate-bounce">
                  <BookOpen size={48} className="text-indigo-600" />
              </div>
          </div>
          <h3 className="text-xl font-bold text-indigo-900 mb-2 animate-pulse">
              {LOADING_MESSAGES[loadingMessageIndex]}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs text-center">
              Yapay zeka dersini kişiselleştiriyor, lütfen bekle...
          </p>
      </div>
  );

  const renderMemory = () => (
      <div className="max-w-md mx-auto p-4 space-y-6 pb-24">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 animate-pop-in">
              <div className="flex items-center space-x-3 mb-2">
                  <BrainCircuit className="text-indigo-600" size={24} />
                  <h2 className="text-2xl font-bold text-gray-800">Bellek</h2>
              </div>
              <p className="text-gray-500 text-sm">Öğrendiğin kelimeler burada saklanır.</p>
          </div>

          {userState.learnedVocabulary.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                  <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Henüz hiç kelime öğrenmedin.<br/>Bir ders tamamla!</p>
              </div>
          ) : (
              <div className="grid gap-3">
                  {userState.learnedVocabulary.map((vocab, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-indigo-400 animate-fade-in" style={{animationDelay: `${idx * 50}ms`}}>
                          <div>
                              <p className="font-bold text-indigo-900 text-lg">{vocab.fr}</p>
                              <p className="text-gray-600 text-sm">{vocab.tr}</p>
                          </div>
                          <AudioPlayer text={vocab.fr} size={20} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100" />
                      </div>
                  ))}
              </div>
          )}
      </div>
  );

  const renderDashboard = () => (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-24">
      {/* Header Stats */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 animate-pop-in" style={{animationDelay: '0ms'}}>
        <div className="flex items-center space-x-2 text-amber-500">
          <Zap fill="currentColor" />
          <span className="font-bold text-xl">{userState.streak} Gün</span>
        </div>
        <div className="flex items-center space-x-2 text-indigo-600">
          <Trophy fill="currentColor" />
          <span className="font-bold text-xl">{userState.xp} XP</span>
        </div>
      </div>

      {/* Mascot/Greeting */}
      <div className="bg-indigo-600 rounded-2xl p-6 text-white text-center shadow-lg relative overflow-hidden animate-pop-in" style={{animationDelay: '100ms'}}>
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-2">Bonjour! 👋</h1>
          <p className="opacity-90">Bugün Fransızca öğrenmek için harika bir gün.</p>
        </div>
        <div className="absolute -right-4 -bottom-10 opacity-20">
          <BookOpen size={150} />
        </div>
      </div>

      {/* Arcade Button */}
      <button 
          onClick={() => setIsPlayingArcade(true)}
          className="w-full bg-gradient-to-r from-indigo-900 to-purple-900 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between group animate-pop-in"
          style={{animationDelay: '150ms'}}
      >
          <div className="flex items-center space-x-4">
              <div className="bg-white/20 p-3 rounded-full">
                  <Gamepad2 className="text-white animate-pulse" size={24} />
              </div>
              <div className="text-left">
                  <h3 className="font-bold text-lg">Kelime Yağmuru</h3>
                  <p className="text-indigo-200 text-xs">Arcade Modu • Hızlı düşün!</p>
              </div>
          </div>
          <ChevronRight className="text-white/50 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* SRS Weak Areas Alert */}
      {userState.weakAreas.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start animate-pulse-once">
              <BrainCircuit className="text-orange-500 mr-3 mt-1 flex-shrink-0" size={20} />
              <div>
                  <h3 className="font-bold text-orange-800 text-sm">Adaptif Tekrar (SRS)</h3>
                  <p className="text-orange-600 text-xs mt-1">Zorlandığın {userState.weakAreas.length} konuyu tespit ettim. Sonraki derslerde bunları tekrar edeceğiz.</p>
              </div>
          </div>
      )}

      {/* Quick Start Buttons */}
      <div className="space-y-3 animate-slide-in-right" style={{animationDelay: '200ms'}}>
        <h2 className="font-bold text-gray-700 text-lg">Dersler</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
                { title: 'Selamlaşma', icon: '👋', desc: 'Tanışma ifadeleri' }, 
                { title: 'Restoranda', icon: '🥐', desc: 'Sipariş verme' }, 
                { title: 'Günlük Rutin', icon: '📅', desc: 'Zaman kavramları' }, 
                { title: 'Aile & Arkadaşlar', icon: '👨‍👩‍👧', desc: 'Yakınlarını tanıt' },
                { title: 'Alışveriş', icon: '🛍️', desc: 'Fiyat sorma' },
                { title: 'Yol Tarifi', icon: '🗺️', desc: 'Yön bulma' },
                { title: 'Hobiler', icon: '🎨', desc: 'Nelerden hoşlanırsın?' },
                { title: 'Hava Durumu', icon: '☀️', desc: 'Bugün hava nasıl?' },
                { title: 'Seyahat', icon: '✈️', desc: 'Otel ve bilet' },
                { title: 'Sağlık', icon: '🏥', desc: 'Doktorda derdini anlat' }
            ].map((item, index) => (
              <button
                key={item.title}
                onClick={() => startLesson(item.title)}
                className="group relative w-full flex items-center p-4 bg-white hover:bg-indigo-50 border border-gray-200 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 text-left"
                style={{ animationDelay: `${300 + index * 50}ms` }}
              >
                <div className="mr-3 text-3xl group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                </div>
                <div className="flex-grow">
                    <h3 className="font-bold text-gray-800 text-sm">{item.title}</h3>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-transform" size={18} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  const renderLessonIntro = (lesson: Lesson) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center space-y-6">
      <h2 className="text-3xl font-bold text-indigo-800 animate-slide-in-right">{lesson.topic}</h2>
      <div className="bg-white p-6 rounded-2xl shadow-md w-full max-w-sm animate-pop-in" style={{animationDelay: '100ms'}}>
        <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-4">Bu derste öğreneceklerin</h3>
        <ul className="text-left space-y-3">
            {lesson.learning_objectives.map((obj, i) => (
                <li key={i} className="flex items-start text-gray-700">
                    <Check size={18} className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                    <span>{obj}</span>
                </li>
            ))}
        </ul>
      </div>
      <button 
        onClick={handleNextStep}
        className="bg-indigo-600 text-white px-10 py-4 rounded-full font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-105 animate-slide-in-right"
        style={{animationDelay: '300ms'}}
      >
        {lesson.ui_prompts.start_button_tr}
      </button>
    </div>
  );

  const renderVocabulary = (lesson: Lesson) => (
     <div className="max-w-md mx-auto p-6 space-y-6">
        <h3 className="text-2xl font-bold text-gray-800 text-center mb-6">Yeni Kelimeler</h3>
        <div className="space-y-4">
            {lesson.vocabulary.map((word, i) => (
                <div key={i} className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-indigo-500 flex items-center justify-between animate-slide-in-right" style={{animationDelay: `${i * 100}ms`}}>
                    <div>
                        <p className="text-2xl font-bold text-indigo-900 mb-1">{word.fr}</p>
                        <p className="text-gray-500 text-lg">{word.tr}</p>
                        <span className="text-xs text-indigo-300 bg-indigo-50 px-2 py-1 rounded mt-1 inline-block">{word.pos}</span>
                    </div>
                    <AudioPlayer text={word.fr} size={28} className="shadow-sm" />
                </div>
            ))}
        </div>
        <button 
            onClick={handleNextStep} 
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold mt-6 shadow-lg hover:bg-indigo-700 transition-colors animate-fade-in"
        >
            Devam Et
        </button>
     </div>
  );

  const renderDialog = (lesson: Lesson) => (
    <div className="max-w-md mx-auto p-6 flex flex-col h-full min-h-[70vh]">
        <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">Diyalog</h3>
        <div className="space-y-6 flex-grow">
            {lesson.dialogs.map((line, i) => (
                <div key={i} className={`flex ${line.role === 'NPC' ? 'justify-start' : 'justify-end'} animate-slide-in-right`} style={{animationDelay: `${i * 300}ms`}}>
                    <div className={`relative max-w-[85%] p-5 rounded-2xl shadow-sm transition-transform hover:scale-[1.02] ${line.role === 'NPC' ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold opacity-70 tracking-wider uppercase">{line.role}</span>
                            <AudioPlayer 
                                text={line.fr}
                                className={line.role === 'NPC' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-indigo-500 hover:bg-indigo-400 text-white'} 
                                size={18}
                            />
                        </div>
                        <p className="font-medium text-lg leading-relaxed">{line.fr}</p>
                        <div className="mt-3 pt-2 border-t border-current/10">
                            <p className="text-sm opacity-80 italic">{line.tr}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <button 
            onClick={handleNextStep} 
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold mt-6 shadow-lg animate-fade-in"
        >
            Alıştırmalara Geç
        </button>
    </div>
  );

  // --- Remedial Content Modal ---
  const renderRemedialModal = () => {
      if (!remedialContent && !isRemedialLoading) return null;

      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 animate-pop-in">
                  <div className="bg-amber-400 p-4 flex items-center text-white justify-between">
                      <div className="flex items-center">
                          <Lightbulb size={24} className="mr-2" />
                          <h3 className="font-bold text-lg">Mini Ders: İpucu</h3>
                      </div>
                      <div className="bg-amber-50 px-2 py-1 rounded text-xs font-bold uppercase">Adaptif</div>
                  </div>
                  <div className="p-6">
                      {isRemedialLoading ? (
                          <div className="flex flex-col items-center py-6 text-gray-500">
                              <RefreshCcw className="animate-spin mb-3 text-amber-500" size={32} />
                              <p className="text-center">Hatana özel bir ipucu hazırlıyorum...</p>
                          </div>
                      ) : (
                          <>
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-6">
                                <p className="text-gray-800 text-lg leading-relaxed">
                                    {remedialContent}
                                </p>
                            </div>
                            <button 
                                onClick={closeRemedialModal}
                                className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md"
                            >
                                Anladım, Tekrar Dene
                            </button>
                          </>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  const renderExercise = (lesson: Lesson, exerciseIndex: number) => {
    const exercise = lesson.exercises[exerciseIndex];
    let innerContent = null;

    // Determine specific content based on type
    if (exercise.type === ExerciseType.MULTIPLE_CHOICE || exercise.type === ExerciseType.LISTEN_AND_SELECT) {
        innerContent = (
            <>
                {exercise.type === ExerciseType.LISTEN_AND_SELECT && (
                    <div className="flex flex-col items-center justify-center mb-8 p-8 bg-indigo-50 rounded-2xl border-2 border-dashed border-indigo-200">
                         <AudioPlayer 
                            text={exercise.correct_answers?.[0] || "Ecoutez"}
                            size={64} 
                            className="p-8 bg-white text-indigo-600 shadow-xl hover:bg-indigo-50 hover:scale-105 transform transition-all mb-4" 
                            autoPlay 
                         />
                         <p className="text-sm text-gray-500 font-medium">Dinlemek için dokun</p>
                    </div>
                )}
                <div className="grid gap-3">
                    {exercise.options?.map((opt, i) => {
                        const isSuccess = feedback?.type === 'success';
                        const optStr = String(opt || "");
                        const correctAnswers = exercise.correct_answers || [];
                        const isCorrect = correctAnswers.some(a => normalizeText(a) === normalizeText(optStr));
                        const isSelectedAndCorrect = isSuccess && isCorrect;

                        return (
                        <button 
                            key={i}
                            onClick={() => handleExerciseSubmit(exercise, optStr)}
                            disabled={isSuccess}
                            className={`p-4 rounded-xl border-2 text-left font-medium transition-all flex items-center justify-between
                                ${isSelectedAndCorrect 
                                    ? 'bg-green-100 border-green-500 text-green-800 scale-[1.02]' 
                                    : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700 bg-white active:scale-98'}
                            `}
                        >
                            <span>{optStr}</span>
                            {isSelectedAndCorrect && <Check size={20} className="text-green-600" />}
                        </button>
                    )})}
                </div>
            </>
        );
    } else if (exercise.type === ExerciseType.SAY_ALOUD) {
        innerContent = (
             <div className="flex flex-col items-center space-y-8 py-8">
                <div className="text-center w-full">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-4">
                        <p className="text-2xl font-bold text-indigo-800 mb-4 leading-relaxed">"{exercise.pronunciation_check?.expected_text}"</p>
                        <div className="flex justify-center">
                            <AudioPlayer text={exercise.pronunciation_check?.expected_text || ''} className="bg-indigo-100 hover:bg-indigo-200" />
                        </div>
                    </div>
                    <p className="text-gray-500 text-sm">Mikrofona dokun ve cümleyi oku</p>
                </div>
                
                <VoiceInput onResult={(transcript) => handlePronunciationCheck(exercise, transcript)} />
             </div>
        );
    } else if (exercise.type === ExerciseType.MATCHING) {
        innerContent = (
           <div className="text-center py-10">
               <p className="text-gray-500">Bu alıştırma oyun modunda açılacak.</p>
               <button onClick={handleNextStep} className="mt-4 text-indigo-600 font-bold underline">Geç</button>
           </div>
        );
    } else {
        // Default: Translate or Fill Gap (Text Input)
        const inputPlaceholder = exercise.type === ExerciseType.TRANSLATE ? "Çeviriyi yaz..." : "Boşluğu doldur...";
        
        innerContent = (
            <>
                <div className="bg-white p-2 rounded-xl border-2 border-gray-200 focus-within:border-indigo-500 transition-colors mb-4">
                    <input 
                        type="text" 
                        className="w-full p-4 outline-none text-lg text-gray-900"
                        placeholder={inputPlaceholder}
                        value={userInputText}
                        onChange={(e) => setUserInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !feedback?.type) {
                                handleExerciseSubmit(exercise, userInputText);
                            }
                        }}
                    />
                </div>
                
                <div className="flex gap-3">
                    {(!feedback || feedback.type !== 'success') && (
                        <>
                             <button 
                                onClick={() => handleExerciseSubmit(exercise, userInputText)}
                                className="flex-grow bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-md active:scale-95 transition-all"
                            >
                                Kontrol Et
                            </button>
                            <button 
                                onClick={handleSkipExercise}
                                className="px-6 py-4 bg-gray-100 text-gray-500 rounded-xl font-bold hover:bg-gray-200 transition-colors flex flex-col items-center justify-center"
                                title="Atla"
                            >
                                <SkipForward size={20} />
                            </button>
                        </>
                    )}
                </div>
            </>
        );
    }

    return (
        <div className="max-w-md mx-auto p-6 flex flex-col min-h-[70vh] relative">
             {renderRemedialModal()}

             <div className="flex-grow">
                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                        Alıştırma {exerciseIndex + 1} / {lesson.exercises.length}
                    </h4>
                    <button 
                        onClick={() => setShowTranslation(!showTranslation)}
                        className="flex items-center space-x-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                    >
                        <Languages size={14} />
                        <span>{showTranslation ? 'Çeviriyi Gizle' : 'Çevir'}</span>
                    </button>
                </div>

                <div className="mb-8 animate-slide-in-right">
                    <h3 className="text-xl font-bold text-gray-800 leading-snug">{exercise.prompt_fr}</h3>
                    {(showTranslation || exercise.prompt_tr) && showTranslation && (
                        <p className="text-indigo-600 mt-2 animate-fade-in bg-indigo-50 p-2 rounded-lg text-sm border border-indigo-100">
                            {exercise.prompt_tr || "Çeviri yükleniyor..."}
                        </p>
                    )}
                    
                    {/* Auto-show Turkish prompt for Translation Exercises to prevent confusion */}
                    {(exercise.type === ExerciseType.TRANSLATE || exercise.type === ExerciseType.FILL_GAP) && !showTranslation && (
                        <div className="mt-4 p-3 bg-indigo-50 rounded-lg border-l-4 border-indigo-400">
                            <span className="text-xs font-bold text-indigo-400 block mb-1">GÖREV</span>
                            <p className="text-indigo-900 font-medium">{exercise.prompt_tr}</p>
                        </div>
                    )}
                </div>

                <div className="animate-slide-in-right" style={{animationDelay: '100ms'}}>
                    {innerContent}
                </div>
                
                {/* Skip button for multiple choice types if needed (bottom right absolute or integrated) */}
                {(exercise.type === ExerciseType.MULTIPLE_CHOICE || exercise.type === ExerciseType.LISTEN_AND_SELECT) && !feedback && (
                     <div className="flex justify-end mt-4">
                        <button 
                            onClick={handleSkipExercise}
                            className="text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Bu soruyu atla <SkipForward size={14} className="ml-1" />
                        </button>
                     </div>
                )}
             </div>
             
             {feedback && (
                 <div className={`p-4 rounded-xl mb-4 flex items-start shadow-sm animate-pop-in ${feedback.type === 'success' ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-red-50 border border-red-100 text-red-800'}`}>
                    <div className={`p-2 rounded-full mr-3 ${feedback.type === 'success' ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>
                        {feedback.type === 'success' ? <Check size={20} /> : <X size={20} />}
                    </div>
                    <div className="flex-grow">
                        <p className="font-bold text-lg">{feedback.type === 'success' ? 'Doğru!' : 'Yanlış'}</p>
                        <p className="text-sm opacity-90 mt-1">{feedback.msg}</p>
                    </div>
                 </div>
             )}

            {feedback?.type === 'success' ? (
                <button onClick={handleNextStep} className="w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg transform transition-all hover:scale-[1.02] animate-pop-in">
                    Devam Et
                </button>
            ) : (
               <div className="h-14"></div>
            )}
        </div>
    );
  };

  const renderSummary = (lesson: Lesson) => (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
          <div className="bg-yellow-400 p-6 rounded-full text-white mb-6 shadow-lg animate-pop-in">
              <Trophy size={64} />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2 animate-fade-in">Ders Tamamlandı!</h2>
          <p className="text-gray-500 mb-8 animate-fade-in">Harika iş çıkardın.</p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8 animate-slide-in-right">
              <div className="bg-white p-4 rounded-xl shadow border border-gray-100">
                  <p className="text-gray-400 text-xs font-bold uppercase">Kazanılan XP</p>
                  <p className="text-2xl font-bold text-indigo-600">+50</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow border border-gray-100">
                  <p className="text-gray-400 text-xs font-bold uppercase">Yeni Kelimeler</p>
                  <p className="text-2xl font-bold text-green-500">{lesson.vocabulary.length}</p> 
              </div>
          </div>

          <div className="w-full max-w-md bg-indigo-50 p-6 rounded-xl text-left mb-8 border border-indigo-100 animate-slide-in-right" style={{animationDelay: '200ms'}}>
              <div className="flex items-center mb-2 text-indigo-800">
                <BookOpen size={18} className="mr-2" />
                <h4 className="font-bold">Kültürel Not</h4>
              </div>
              <p className="text-indigo-700 text-sm leading-relaxed">{lesson.cultural_note.text_tr}</p>
          </div>

          <button 
            onClick={finishLesson}
            className="bg-gray-900 text-white px-10 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-black transition-all animate-fade-in"
          >
            Ana Ekrana Dön
          </button>
      </div>
  );

  const renderContent = () => {
    if (isLoading) return renderLoadingScreen();
    if (activeTab === 'memory' && !currentLesson && !isPlayingArcade) return renderMemory();
    if (!currentLesson) return renderDashboard();

    const totalExerciseSteps = currentLesson.exercises.length;
    const totalGameSteps = currentLesson.games.length;

    if (lessonStep === 0) return renderLessonIntro(currentLesson);
    if (lessonStep === 1) return renderVocabulary(currentLesson);
    if (lessonStep === 2) return renderDialog(currentLesson);
    
    const exerciseIndex = lessonStep - 3;
    if (exerciseIndex < totalExerciseSteps) {
        return renderExercise(currentLesson, exerciseIndex);
    }

    const gameIndex = lessonStep - 3 - totalExerciseSteps;
    if (gameIndex < totalGameSteps) {
        return (
            <div className="p-4 pt-10">
                <MiniGame 
                    game={currentLesson.games[gameIndex]} 
                    vocab={currentLesson.vocabulary}
                    onComplete={(score) => {
                        setUserState(prev => ({ ...prev, xp: prev.xp + score }));
                        handleNextStep();
                    }} 
                />
            </div>
        );
    }

    return renderSummary(currentLesson);
  };

  // --- Word Rain Arcade Mode ---
  if (isPlayingArcade) {
      return (
          <WordRainGame 
            vocabulary={userState.learnedVocabulary} 
            onExit={() => setIsPlayingArcade(false)}
            onComplete={(xp) => setUserState(prev => ({ ...prev, xp: prev.xp + xp }))}
          />
      );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-gray-200 p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        {currentLesson ? (
            <button onClick={() => setCurrentLesson(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                <ArrowLeft size={20} />
            </button>
        ) : (
             <span className="font-extrabold text-indigo-600 tracking-tight text-lg flex items-center">
                <BookOpen size={20} className="mr-2" />
                Le Professeur
             </span>
        )}
        
        {currentLesson && (
            <div className="flex-1 mx-6 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-indigo-500 transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${(lessonStep / (currentLesson.exercises.length + 4)) * 100}%` }}
                />
            </div>
        )}
        
        {currentLesson && (
            <div className="text-sm font-bold text-indigo-600">
                {userState.xp} XP
            </div>
        )}
      </div>

      <div className="flex-grow bg-gray-50 relative overflow-x-hidden">
          {/* Animation key ensures transitions play when step changes */}
          <div key={currentLesson ? `step-${lessonStep}` : `tab-${activeTab}`} className="animate-fade-in h-full w-full">
            {renderContent()}
          </div>
      </div>

      {/* Bottom Navigation - Only visible on Dashboard/Memory screens */}
      {!currentLesson && !isLoading && (
          <div className="bg-white border-t border-gray-200 flex justify-around p-3 fixed bottom-0 w-full z-30 pb-safe">
              <button 
                onClick={() => setActiveTab('lessons')}
                className={`flex flex-col items-center space-y-1 p-2 rounded-xl w-24 transition-colors ${activeTab === 'lessons' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
              >
                  <Home size={24} />
                  <span className="text-xs font-bold">Dersler</span>
              </button>
              <button 
                onClick={() => setActiveTab('memory')}
                className={`flex flex-col items-center space-y-1 p-2 rounded-xl w-24 transition-colors ${activeTab === 'memory' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
              >
                  <Library size={24} />
                  <span className="text-xs font-bold">Bellek</span>
              </button>
          </div>
      )}

      <ChatBot />
    </div>
  );
};

export default App;
