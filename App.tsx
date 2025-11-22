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
  Gamepad2,
  User,
  LogOut,
  LogIn,
  Moon,
  Sun,
  Lock,
  UserPlus
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
    isAuthenticated: false,
    username: '',
    themePreference: 'light',
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
  const [activeTab, setActiveTab] = useState<'lessons' | 'memory' | 'profile'>('lessons');
  const [isPlayingArcade, setIsPlayingArcade] = useState(false);
  
  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Error handling & Adaptive Learning state
  const [mistakeCount, setMistakeCount] = useState(0);
  const [remedialContent, setRemedialContent] = useState<string | null>(null);
  const [isRemedialLoading, setIsRemedialLoading] = useState(false);

  const isDark = userState.themePreference === 'dark';

  // --- Effects ---

  // 1. Check for Active Session on Mount (Auto-login if session exists)
  useEffect(() => {
      const activeSession = localStorage.getItem('leProf_activeSession');
      if (activeSession) {
          const { username } = JSON.parse(activeSession);
          // Try to load data immediately
          const dataKey = `leProf_data_${username}`;
          const savedData = localStorage.getItem(dataKey);
          if (savedData) {
              try {
                  const parsed = JSON.parse(savedData);
                  setUserState({ ...parsed, isAuthenticated: true, username });
              } catch (e) {
                  console.error("Session restore failed");
              }
          }
      }
  }, []);

  // 2. Save Data ONLY when state changes AND user is authenticated
  useEffect(() => {
      if (userState.isAuthenticated && userState.username) {
          const dataKey = `leProf_data_${userState.username}`;
          localStorage.setItem(dataKey, JSON.stringify(userState));
      }
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

  // --- Auth Logic ---

  // Helper to get credentials DB
  const getCredsDB = () => {
      const db = localStorage.getItem('leProf_creds');
      return db ? JSON.parse(db) : {};
  };

  const handleRegister = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');

      if (!authUsername.trim() || !authPassword.trim()) {
          setAuthError("Kullanıcı adı ve şifre zorunludur.");
          return;
      }

      const db = getCredsDB();
      const username = authUsername.trim().toLowerCase();

      if (db[username]) {
          setAuthError("Bu kullanıcı adı zaten alınmış. Lütfen giriş yapın.");
          return;
      }

      // 1. Save Credentials
      db[username] = authPassword.trim();
      localStorage.setItem('leProf_creds', JSON.stringify(db));

      // 2. Initialize User Data
      const newUserState: UserState = {
          ...INITIAL_STATE,
          isAuthenticated: true,
          username: username, // Keep original casing for display if desired, using lowercase for ID
          themePreference: 'light'
      };
      
      // 3. Save Data immediately
      localStorage.setItem(`leProf_data_${username}`, JSON.stringify(newUserState));
      
      // 4. Set Session
      localStorage.setItem('leProf_activeSession', JSON.stringify({ username }));

      // 5. Update State
      setUserState(newUserState);
  };

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');

      if (!authUsername.trim() || !authPassword.trim()) {
          setAuthError("Kullanıcı adı ve şifre gerekli.");
          return;
      }

      const db = getCredsDB();
      const username = authUsername.trim().toLowerCase();

      if (!db[username]) {
          setAuthError("Kullanıcı bulunamadı. Lütfen kayıt olun.");
          return;
      }

      if (db[username] !== authPassword.trim()) {
          setAuthError("Şifre yanlış!");
          return;
      }

      // Credentials match - Load Data
      const dataKey = `leProf_data_${username}`;
      const savedData = localStorage.getItem(dataKey);

      if (savedData) {
          const parsed = JSON.parse(savedData);
          // Ensure legacy or missing fields don't break app
          if (!parsed.themePreference) parsed.themePreference = 'light';
          
          const loadedState = { ...parsed, isAuthenticated: true, username: username };
          setUserState(loadedState);
          localStorage.setItem('leProf_activeSession', JSON.stringify({ username }));
      } else {
          // Should not happen if registered correctly, but fallback:
          setAuthError("Veri hatası. Lütfen destekle iletişime geçin.");
      }
  };

  const handleLogout = () => {
      localStorage.removeItem('leProf_activeSession');
      setUserState(INITIAL_STATE);
      setActiveTab('lessons');
      setCurrentLesson(null);
      setAuthUsername('');
      setAuthPassword('');
      setAuthMode('login');
  };

  const toggleTheme = () => {
      setUserState(prev => ({
          ...prev,
          themePreference: prev.themePreference === 'light' ? 'dark' : 'light'
      }));
  };

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
            learnedVocabulary: [...prev.learnedVocabulary, ...newVocab],
            streak: prev.streak, // Could implement daily logic here
            xp: prev.xp + 50 // Bonus for finishing
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

  const renderAuth = () => (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors ${isDark ? 'bg-gray-900' : 'bg-indigo-50'}`}>
          <div className={`p-8 rounded-3xl shadow-xl w-full max-w-sm animate-pop-in border-b-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-200'}`}>
              <div className="flex flex-col items-center mb-6">
                  <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-indigo-900' : 'bg-indigo-100'}`}>
                      <BookOpen size={48} className="text-indigo-600" />
                  </div>
                  <h1 className={`text-3xl font-extrabold ${isDark ? 'text-white' : 'text-indigo-900'}`}>Le Professeur</h1>
                  <p className={`mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Kişisel Fransızca Öğretmenin</p>
              </div>

              {/* Tabs */}
              <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => { setAuthMode('login'); setAuthError(''); }}
                    className={`flex-1 pb-2 font-bold text-sm ${authMode === 'login' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                  >
                      Giriş Yap
                  </button>
                  <button 
                    onClick={() => { setAuthMode('register'); setAuthError(''); }}
                    className={`flex-1 pb-2 font-bold text-sm ${authMode === 'register' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                  >
                      Kayıt Ol
                  </button>
              </div>

              <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                  <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Kullanıcı Adı</label>
                      <div className="relative">
                          <User className="absolute left-3 top-3 text-gray-400" size={20} />
                          <input 
                              type="text" 
                              value={authUsername}
                              onChange={(e) => setAuthUsername(e.target.value)}
                              className={`w-full pl-10 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                isDark 
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                              }`}
                              placeholder="Adın ne?"
                          />
                      </div>
                  </div>
                  <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Şifre</label>
                      <div className="relative">
                          <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                          <input 
                              type="password" 
                              value={authPassword}
                              onChange={(e) => setAuthPassword(e.target.value)}
                              className={`w-full pl-10 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                isDark 
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                              }`}
                              placeholder="******"
                          />
                      </div>
                  </div>

                  {authError && <p className="text-red-500 text-sm font-bold animate-pulse">{authError}</p>}
                  
                  <button 
                      type="submit" 
                      className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:opacity-90 transition-transform transform active:scale-95 flex items-center justify-center ${authMode === 'login' ? 'bg-indigo-600' : 'bg-green-600'}`}
                  >
                      {authMode === 'login' ? (
                          <>Giriş Yap <LogIn className="ml-2" size={20} /></>
                      ) : (
                          <>Hesap Oluştur <UserPlus className="ml-2" size={20} /></>
                      )}
                  </button>
              </form>
              
              <div className={`mt-6 pt-6 border-t text-center ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                  <p className="text-xs text-gray-400">
                      Verileriniz şifrenizle korunur. Şifrenizi unutmayın!
                  </p>
              </div>
          </div>
      </div>
  );

  const renderLoadingScreen = () => (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 ${isDark ? 'bg-gray-900' : 'bg-indigo-50'}`}>
          <div className="relative mb-8">
              <div className="absolute inset-0 bg-indigo-500 rounded-full opacity-20 animate-ping"></div>
              <div className={`p-6 rounded-full shadow-xl relative z-10 animate-bounce ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                  <BookOpen size={48} className="text-indigo-600" />
              </div>
          </div>
          <h3 className={`text-xl font-bold mb-2 animate-pulse ${isDark ? 'text-white' : 'text-indigo-900'}`}>
              {LOADING_MESSAGES[loadingMessageIndex]}
          </h3>
          <p className={`text-sm max-w-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Yapay zeka dersini kişiselleştiriyor, lütfen bekle...
          </p>
      </div>
  );

  const renderProfile = () => (
      <div className="max-w-md mx-auto p-4 space-y-6 pb-24 animate-fade-in">
          <div className={`p-6 rounded-2xl shadow-sm border flex items-center space-x-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'}`}>
              <div className={`p-4 rounded-full ${isDark ? 'bg-indigo-900' : 'bg-indigo-100'}`}>
                  <User size={32} className="text-indigo-600" />
              </div>
              <div>
                  <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{userState.username}</h2>
                  <p className="text-indigo-500 text-sm font-bold">Seviye {userState.level}</p>
              </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl shadow-sm border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center space-x-2 text-gray-400 mb-2">
                      <Trophy size={18} />
                      <span className="text-xs font-bold uppercase">Toplam XP</span>
                  </div>
                  <p className="text-3xl font-black text-indigo-600">{userState.xp}</p>
              </div>
              <div className={`p-5 rounded-2xl shadow-sm border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center space-x-2 text-gray-400 mb-2">
                      <Zap size={18} />
                      <span className="text-xs font-bold uppercase">Seri</span>
                  </div>
                  <p className="text-3xl font-black text-amber-500">{userState.streak} Gün</p>
              </div>
              <div className={`p-5 rounded-2xl shadow-sm border col-span-2 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center space-x-2 text-gray-400 mb-2">
                      <Library size={18} />
                      <span className="text-xs font-bold uppercase">Öğrenilen Kelimeler</span>
                  </div>
                  <p className="text-3xl font-black text-green-500">{userState.learnedVocabulary.length}</p>
              </div>
          </div>

          <div className="pt-4">
              <button 
                  onClick={handleLogout}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center transition-colors ${isDark ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
              >
                  <LogOut size={20} className="mr-2" />
                  Çıkış Yap
              </button>
          </div>
      </div>
  );

  const renderMemory = () => (
      <div className="max-w-md mx-auto p-4 space-y-6 pb-24">
          <div className={`p-6 rounded-2xl shadow-sm border animate-pop-in ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'}`}>
              <div className="flex items-center space-x-3 mb-2">
                  <BrainCircuit className="text-indigo-600" size={24} />
                  <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>Bellek</h2>
              </div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Öğrendiğin kelimeler burada saklanır.</p>
          </div>

          {userState.learnedVocabulary.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                  <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Henüz hiç kelime öğrenmedin.<br/>Bir ders tamamla!</p>
              </div>
          ) : (
              <div className="grid gap-3">
                  {userState.learnedVocabulary.slice().reverse().map((vocab, idx) => (
                      <div key={idx} className={`p-4 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-indigo-400 animate-fade-in ${isDark ? 'bg-gray-800' : 'bg-white'}`} style={{animationDelay: `${Math.min(idx * 50, 500)}ms`}}>
                          <div>
                              <p className="font-bold text-indigo-500 text-lg">{vocab.fr}</p>
                              <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{vocab.tr}</p>
                          </div>
                          <AudioPlayer text={vocab.fr} size={20} className={isDark ? 'bg-gray-700 text-indigo-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'} />
                      </div>
                  ))}
              </div>
          )}
      </div>
  );

  const renderDashboard = () => (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-24">
      {/* Header Stats */}
      <div className={`flex justify-between items-center p-4 rounded-2xl shadow-sm border animate-pop-in ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'}`} style={{animationDelay: '0ms'}}>
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
          <h1 className="text-2xl font-bold mb-2">Bonjour, {userState.username}! 👋</h1>
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
          <div className={`border p-4 rounded-xl flex items-start animate-pulse-once ${isDark ? 'bg-orange-900/30 border-orange-800' : 'bg-orange-50 border-orange-200'}`}>
              <BrainCircuit className="text-orange-500 mr-3 mt-1 flex-shrink-0" size={20} />
              <div>
                  <h3 className="font-bold text-orange-500 text-sm">Adaptif Tekrar (SRS)</h3>
                  <p className={`text-xs mt-1 ${isDark ? 'text-orange-300' : 'text-orange-600'}`}>Zorlandığın {userState.weakAreas.length} konuyu tespit ettim. Sonraki derslerde bunları tekrar edeceğiz.</p>
              </div>
          </div>
      )}

      {/* Quick Start Buttons */}
      <div className="space-y-3 animate-slide-in-right" style={{animationDelay: '200ms'}}>
        <h2 className={`font-bold text-lg ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Dersler</h2>
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
                className={`group relative w-full flex items-center p-4 border rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 text-left
                  ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-indigo-50'}
                `}
                style={{ animationDelay: `${300 + index * 50}ms` }}
              >
                <div className="mr-3 text-3xl group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                </div>
                <div className="flex-grow">
                    <h3 className={`font-bold text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{item.title}</h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.desc}</p>
                </div>
                <ChevronRight className={`transition-transform ${isDark ? 'text-gray-600 group-hover:text-indigo-400' : 'text-gray-300 group-hover:text-indigo-500'} group-hover:translate-x-1`} size={18} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  const renderLessonIntro = (lesson: Lesson) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center space-y-6">
      <h2 className="text-3xl font-bold text-indigo-500 animate-slide-in-right">{lesson.topic}</h2>
      <div className={`p-6 rounded-2xl shadow-md w-full max-w-sm animate-pop-in ${isDark ? 'bg-gray-800' : 'bg-white'}`} style={{animationDelay: '100ms'}}>
        <h3 className="text-gray-500 uppercase text-xs font-bold tracking-wider mb-4">Bu derste öğreneceklerin</h3>
        <ul className="text-left space-y-3">
            {lesson.learning_objectives.map((obj, i) => (
                <li key={i} className={`flex items-start ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
        <h3 className={`text-2xl font-bold text-center mb-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Yeni Kelimeler</h3>
        <div className="space-y-4">
            {lesson.vocabulary.map((word, i) => (
                <div key={i} className={`p-5 rounded-xl shadow-sm border-l-4 border-indigo-500 flex items-center justify-between animate-slide-in-right ${isDark ? 'bg-gray-800' : 'bg-white'}`} style={{animationDelay: `${i * 100}ms`}}>
                    <div>
                        <p className="text-2xl font-bold text-indigo-500 mb-1">{word.fr}</p>
                        <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{word.tr}</p>
                        <span className={`text-xs px-2 py-1 rounded mt-1 inline-block ${isDark ? 'bg-gray-700 text-indigo-300' : 'bg-indigo-50 text-indigo-300'}`}>{word.pos}</span>
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
        <h3 className={`text-xl font-bold mb-6 text-center ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Diyalog</h3>
        <div className="space-y-6 flex-grow">
            {lesson.dialogs.map((line, i) => (
                <div key={i} className={`flex ${line.role === 'NPC' ? 'justify-start' : 'justify-end'} animate-slide-in-right`} style={{animationDelay: `${i * 300}ms`}}>
                    <div className={`relative max-w-[85%] p-5 rounded-2xl shadow-sm transition-transform hover:scale-[1.02] ${
                        line.role === 'NPC' 
                        ? (isDark ? 'bg-gray-800 border-gray-700 text-gray-200 rounded-tl-none border' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none')
                        : 'bg-indigo-600 text-white rounded-tr-none'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold opacity-70 tracking-wider uppercase">{line.role}</span>
                            <AudioPlayer 
                                text={line.fr}
                                className={line.role === 'NPC' ? (isDark ? 'bg-gray-700 text-indigo-300' : 'bg-gray-100 hover:bg-gray-200') : 'bg-indigo-500 hover:bg-indigo-400 text-white'} 
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
              <div className={`rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 animate-pop-in ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                  <div className="bg-amber-500 p-4 flex items-center text-white justify-between">
                      <div className="flex items-center">
                          <Lightbulb size={24} className="mr-2" />
                          <h3 className="font-bold text-lg">Mini Ders: İpucu</h3>
                      </div>
                      <div className="bg-amber-600 px-2 py-1 rounded text-xs font-bold uppercase">Adaptif</div>
                  </div>
                  <div className="p-6">
                      {isRemedialLoading ? (
                          <div className="flex flex-col items-center py-6 text-gray-500">
                              <RefreshCcw className="animate-spin mb-3 text-amber-500" size={32} />
                              <p className="text-center">Hatana özel bir ipucu hazırlıyorum...</p>
                          </div>
                      ) : (
                          <>
                            <div className={`p-4 rounded-xl border mb-6 ${isDark ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-100'}`}>
                                <p className={`text-lg leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
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
                    <div className={`flex flex-col items-center justify-center mb-8 p-8 rounded-2xl border-2 border-dashed ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-indigo-50 border-indigo-200'}`}>
                         <AudioPlayer 
                            text={exercise.correct_answers?.[0] || "Ecoutez"}
                            size={64} 
                            className={`p-8 shadow-xl hover:scale-105 transform transition-all mb-4 ${isDark ? 'bg-gray-700 text-indigo-400' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}
                            autoPlay 
                         />
                         <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Dinlemek için dokun</p>
                    </div>
                )}
                <div className="grid gap-3">
                    {exercise.options?.map((opt, i) => {
                        const isSuccess = feedback?.type === 'success';
                        const optStr = String(opt || "");
                        const correctAnswers = exercise.correct_answers || [];
                        const isCorrect = correctAnswers.some(a => normalizeText(a) === normalizeText(optStr));
                        const isSelectedAndCorrect = isSuccess && isCorrect;

                        let buttonClass = "";
                        if (isSelectedAndCorrect) {
                            buttonClass = "bg-green-100 border-green-500 text-green-800 scale-[1.02]";
                        } else if (isDark) {
                            buttonClass = "bg-gray-800 border-gray-700 text-gray-200 hover:border-indigo-500 hover:bg-gray-750 active:scale-98";
                        } else {
                            buttonClass = "bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 active:scale-98";
                        }

                        return (
                        <button 
                            key={i}
                            onClick={() => handleExerciseSubmit(exercise, optStr)}
                            disabled={isSuccess}
                            className={`p-4 rounded-xl border-2 text-left font-medium transition-all flex items-center justify-between ${buttonClass}`}
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
                    <div className={`p-6 rounded-2xl border shadow-sm mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <p className="text-2xl font-bold text-indigo-500 mb-4 leading-relaxed">"{exercise.pronunciation_check?.expected_text}"</p>
                        <div className="flex justify-center">
                            <AudioPlayer text={exercise.pronunciation_check?.expected_text || ''} className={isDark ? 'bg-gray-700 text-indigo-400' : 'bg-indigo-100 hover:bg-indigo-200'} />
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
                <div className={`p-2 rounded-xl border-2 transition-colors mb-4 ${isDark ? 'bg-gray-800 border-gray-700 focus-within:border-indigo-500' : 'bg-white border-gray-200 focus-within:border-indigo-500'}`}>
                    <input 
                        type="text" 
                        className={`w-full p-4 outline-none text-lg bg-transparent ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
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
                                className={`px-6 py-4 rounded-xl font-bold transition-colors flex flex-col items-center justify-center ${isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
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
                        className={`flex items-center space-x-1 text-xs font-bold px-3 py-1 rounded-full transition-colors ${isDark ? 'bg-gray-800 text-indigo-400 hover:bg-gray-700' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                    >
                        <Languages size={14} />
                        <span>{showTranslation ? 'Çeviriyi Gizle' : 'Çevir'}</span>
                    </button>
                </div>

                <div className="mb-8 animate-slide-in-right">
                    <h3 className={`text-xl font-bold leading-snug ${isDark ? 'text-white' : 'text-gray-800'}`}>{exercise.prompt_fr}</h3>
                    {(showTranslation || exercise.prompt_tr) && showTranslation && (
                        <p className={`mt-2 animate-fade-in p-2 rounded-lg text-sm border ${isDark ? 'bg-indigo-900/30 text-indigo-300 border-indigo-800' : 'text-indigo-600 bg-indigo-50 border-indigo-100'}`}>
                            {exercise.prompt_tr || "Çeviri yükleniyor..."}
                        </p>
                    )}
                    
                    {/* Auto-show Turkish prompt for Translation Exercises to prevent confusion */}
                    {(exercise.type === ExerciseType.TRANSLATE || exercise.type === ExerciseType.FILL_GAP) && !showTranslation && (
                        <div className={`mt-4 p-3 rounded-lg border-l-4 border-indigo-400 ${isDark ? 'bg-gray-800' : 'bg-indigo-50'}`}>
                            <span className="text-xs font-bold text-indigo-400 block mb-1">GÖREV</span>
                            <p className={`font-medium ${isDark ? 'text-gray-200' : 'text-indigo-900'}`}>{exercise.prompt_tr}</p>
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
                 <div className={`p-4 rounded-xl mb-4 flex items-start shadow-sm animate-pop-in ${feedback.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
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
          <h2 className={`text-3xl font-bold mb-2 animate-fade-in ${isDark ? 'text-white' : 'text-gray-800'}`}>Ders Tamamlandı!</h2>
          <p className="text-gray-500 mb-8 animate-fade-in">Harika iş çıkardın.</p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8 animate-slide-in-right">
              <div className={`p-4 rounded-xl shadow border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                  <p className="text-gray-400 text-xs font-bold uppercase">Kazanılan XP</p>
                  <p className="text-2xl font-bold text-indigo-600">+50</p>
              </div>
              <div className={`p-4 rounded-xl shadow border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                  <p className="text-gray-400 text-xs font-bold uppercase">Yeni Kelimeler</p>
                  <p className="text-2xl font-bold text-green-500">{lesson.vocabulary.length}</p> 
              </div>
          </div>

          <div className={`w-full max-w-md p-6 rounded-xl text-left mb-8 border animate-slide-in-right ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-indigo-50 border-indigo-100'}`} style={{animationDelay: '200ms'}}>
              <div className={`flex items-center mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-800'}`}>
                <BookOpen size={18} className="mr-2" />
                <h4 className="font-bold">Kültürel Not</h4>
              </div>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-indigo-700'}`}>{lesson.cultural_note.text_tr}</p>
          </div>

          <button 
            onClick={finishLesson}
            className={`px-10 py-4 rounded-xl font-bold text-lg shadow-lg transition-all animate-fade-in ${isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-gray-900 hover:bg-black text-white'}`}
          >
            Ana Ekrana Dön
          </button>
      </div>
  );

  const renderContent = () => {
    // Auth Guard
    if (!userState.isAuthenticated) return renderAuth();

    if (isLoading) return renderLoadingScreen();
    if (activeTab === 'memory' && !currentLesson && !isPlayingArcade) return renderMemory();
    if (activeTab === 'profile' && !currentLesson && !isPlayingArcade) return renderProfile();
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
            onComplete={(xp, newWords) => {
                setUserState(prev => {
                    // Combine and remove duplicates based on French word
                    const existingFr = new Set(prev.learnedVocabulary.map(v => v.fr));
                    const uniqueNewWords = newWords.filter(v => !existingFr.has(v.fr));
                    
                    return { 
                        ...prev, 
                        xp: prev.xp + xp,
                        learnedVocabulary: [...prev.learnedVocabulary, ...uniqueNewWords]
                    };
                });
            }}
          />
      );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
      {/* Top Bar */}
      <div className={`p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm transition-colors ${isDark ? 'bg-gray-800 border-b border-gray-700' : 'bg-white border-b border-gray-200'}`}>
        <div className="flex items-center">
             {currentLesson ? (
                <button onClick={() => setCurrentLesson(null)} className={`p-2 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <ArrowLeft size={20} />
                </button>
            ) : (
                 <span className="font-extrabold text-indigo-500 tracking-tight text-lg flex items-center">
                    <BookOpen size={20} className="mr-2" />
                    Le Professeur
                 </span>
            )}
        </div>

        {/* Center Progress Bar (Only in lesson) */}
        {currentLesson ? (
            <div className={`flex-1 mx-6 h-3 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <div 
                    className="h-full bg-indigo-500 transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${(lessonStep / (currentLesson.exercises.length + 4)) * 100}%` }}
                />
            </div>
        ) : (
            // Theme Toggle in Dashboard
            <button 
                onClick={toggleTheme}
                className={`p-2 rounded-full transition-colors mr-2 ${isDark ? 'bg-gray-700 text-yellow-300' : 'bg-gray-100 text-gray-600'}`}
                title="Temayı Değiştir"
            >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
        )}
        
        {currentLesson && (
            <div className="text-sm font-bold text-indigo-500">
                {userState.xp} XP
            </div>
        )}
      </div>

      <div className="flex-grow relative overflow-x-hidden">
          {/* Animation key ensures transitions play when step changes */}
          <div key={currentLesson ? `step-${lessonStep}` : `tab-${activeTab}`} className="animate-fade-in h-full w-full">
            {renderContent()}
          </div>
      </div>

      {/* Bottom Navigation - Only visible on Dashboard/Memory screens */}
      {!currentLesson && !isLoading && userState.isAuthenticated && (
          <div className={`flex justify-around p-3 fixed bottom-0 w-full z-30 pb-safe border-t transition-colors ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <button 
                onClick={() => setActiveTab('lessons')}
                className={`flex flex-col items-center space-y-1 p-2 rounded-xl w-20 transition-colors ${activeTab === 'lessons' ? (isDark ? 'text-indigo-400 bg-gray-700' : 'text-indigo-600 bg-indigo-50') : 'text-gray-400 hover:text-gray-500'}`}
              >
                  <Home size={24} />
                  <span className="text-xs font-bold">Dersler</span>
              </button>
              <button 
                onClick={() => setActiveTab('memory')}
                className={`flex flex-col items-center space-y-1 p-2 rounded-xl w-20 transition-colors ${activeTab === 'memory' ? (isDark ? 'text-indigo-400 bg-gray-700' : 'text-indigo-600 bg-indigo-50') : 'text-gray-400 hover:text-gray-500'}`}
              >
                  <Library size={24} />
                  <span className="text-xs font-bold">Bellek</span>
              </button>
              <button 
                onClick={() => setActiveTab('profile')}
                className={`flex flex-col items-center space-y-1 p-2 rounded-xl w-20 transition-colors ${activeTab === 'profile' ? (isDark ? 'text-indigo-400 bg-gray-700' : 'text-indigo-600 bg-indigo-50') : 'text-gray-400 hover:text-gray-500'}`}
              >
                  <User size={24} />
                  <span className="text-xs font-bold">Sen</span>
              </button>
          </div>
      )}

      <ChatBot />
    </div>
  );
};

export default App;