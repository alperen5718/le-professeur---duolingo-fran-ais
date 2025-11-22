import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Heart, Trophy, Keyboard } from 'lucide-react';
import { Vocabulary } from '../types';

interface WordRainGameProps {
  vocabulary: Vocabulary[];
  onExit: () => void;
  onComplete: (xp: number, newWords: Vocabulary[]) => void;
}

interface FallingWord {
  id: number;
  textFr: string;
  textTr: string;
  x: number;
  y: number;
  speed: number;
  color: string;
  isNew: boolean; // Is this a word not yet in user's memory?
  originalVocab: Vocabulary;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const WordRainGame: React.FC<WordRainGameProps> = ({ vocabulary, onExit, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Game State
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [inputValue, setInputValue] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [level, setLevel] = useState(1);

  // Refs for game loop variables to avoid closure staleness
  const gameState = useRef({
    words: [] as FallingWord[],
    particles: [] as Particle[],
    sessionLearnedWords: [] as Vocabulary[], // Track words learned in this session
    recentHistory: [] as string[], // Track recently spawned words to prevent repeats
    lastSpawnTime: 0,
    spawnRate: 3000, // Slower start (was 2500)
    score: 0,
    lives: 3,
    isPlaying: true,
    animationFrameId: 0,
    // Combine user vocab with fallback, prioritize user vocab but mix in new ones if needed
    vocabList: vocabulary.length > 20 ? vocabulary : [...vocabulary, ...FALLBACK_VOCAB]
  });

  // Normalize text helper (remove accents, punctuation)
  const normalize = (text: string) => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  };

  const spawnWord = (width: number) => {
    const { vocabList, words, recentHistory } = gameState.current;
    
    // Filter candidates:
    // 1. Must not be currently falling on screen
    // 2. Must not be in recent history (last 15 words)
    let candidates = vocabList.filter(v => 
        !words.some(w => w.textFr === v.fr) && 
        !recentHistory.includes(v.fr)
    );

    // If we run out of candidates (rare), clear history and fallback to full list
    if (candidates.length === 0) {
        gameState.current.recentHistory = [];
        candidates = vocabList.filter(v => !words.some(w => w.textFr === v.fr));
        // If still empty (screen full), abort spawn
        if (candidates.length === 0) return;
    }

    const randomVocab = candidates[Math.floor(Math.random() * candidates.length)];
    
    // Update history
    gameState.current.recentHistory.push(randomVocab.fr);
    if (gameState.current.recentHistory.length > 20) {
        gameState.current.recentHistory.shift();
    }

    // Determine if this is a "new" word (from fallback) or existing
    const isKnown = vocabulary.some(v => v.fr === randomVocab.fr);

    // Ensure text fits within canvas width (padding 20px)
    const x = Math.random() * (width - 150) + 20;
    
    // SPEED ADJUSTMENT: Much slower base speed
    // Old: 0.3 + score/1000
    // New: 0.15 + score/2000 (Very floaty start)
    const baseSpeed = 0.15 + (gameState.current.score / 2000); 
    
    const word: FallingWord = {
      id: Date.now() + Math.random(),
      textFr: randomVocab.fr,
      textTr: randomVocab.tr,
      x: x,
      y: -50, // Start higher up
      speed: baseSpeed + Math.random() * 0.2, // Less variance
      color: isKnown ? '#ffffff' : '#fbbf24', // Gold color for new words
      isNew: !isKnown,
      originalVocab: randomVocab
    };
    
    gameState.current.words.push(word);
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      gameState.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color
      });
    }
  };

  const checkInput = (input: string) => {
    const normalizedInput = normalize(input);
    const matchIndex = gameState.current.words.findIndex(
      w => normalize(w.textTr) === normalizedInput
    );

    if (matchIndex !== -1) {
      // Correct Match
      const word = gameState.current.words[matchIndex];
      
      // Track learned word if it was new/unknown
      if (word.isNew) {
          // Avoid duplicates in session list
          const alreadyTracked = gameState.current.sessionLearnedWords.some(w => w.fr === word.originalVocab.fr);
          if (!alreadyTracked) {
              gameState.current.sessionLearnedWords.push(word.originalVocab);
          }
      }
      
      // Update Score
      gameState.current.score += 10;
      setScore(gameState.current.score);
      
      // Level up logic
      const newLevel = Math.floor(gameState.current.score / 100) + 1;
      if (newLevel > level) setLevel(newLevel);

      // Visuals
      createExplosion(word.x, word.y, '#4ade80'); // Green explosion
      
      // Audio
      const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});

      // Remove word
      gameState.current.words.splice(matchIndex, 1);
      
      // Clear input
      setInputValue('');
      
      // Adjust spawn rate - caps at 800ms (slower cap)
      gameState.current.spawnRate = Math.max(800, 3000 - (gameState.current.score * 1.5));
      
      return true;
    }
    return false;
  };

  // Main Game Loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState.current.isPlaying) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1e1b4b'); // indigo-950
    gradient.addColorStop(1, '#312e81'); // indigo-900
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Spawn Logic
    const now = Date.now();
    if (now - gameState.current.lastSpawnTime > gameState.current.spawnRate) {
      spawnWord(canvas.width);
      gameState.current.lastSpawnTime = now;
    }

    // 3. Update & Draw Words
    ctx.font = 'bold 20px Nunito, sans-serif';
    
    for (let i = gameState.current.words.length - 1; i >= 0; i--) {
      const word = gameState.current.words[i];
      word.y += word.speed;

      // Draw Word
      ctx.fillStyle = word.color;
      ctx.fillText(word.textFr, word.x, word.y);
      
      // Check Collision (Bottom)
      if (word.y > canvas.height) {
        gameState.current.words.splice(i, 1);
        gameState.current.lives -= 1;
        setLives(gameState.current.lives);
        
        // Screen shake effect (visual only via CSS class if we wanted, but purely canvas here)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (gameState.current.lives <= 0) {
          setGameOver(true);
          gameState.current.isPlaying = false;
        }
      }
    }

    // 4. Update & Draw Particles
    for (let i = gameState.current.particles.length - 1; i >= 0; i--) {
      const p = gameState.current.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.05;
      
      if (p.life <= 0) {
        gameState.current.particles.splice(i, 1);
      } else {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    gameState.current.animationFrameId = requestAnimationFrame(gameLoop);
  }, [level]);

  // Initialization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Set canvas to full window size
      const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      window.addEventListener('resize', resize);
      resize();

      gameState.current.isPlaying = true;
      gameState.current.animationFrameId = requestAnimationFrame(gameLoop);
      
      // Focus input
      inputRef.current?.focus();

      return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(gameState.current.animationFrameId);
      };
    }
  }, [gameLoop]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      checkInput(inputValue);
    }
  };

  const handleGameOverExit = () => {
      // Award partial XP based on score
      const xpAwarded = Math.floor(score / 10);
      // Pass newly learned words back to App
      onComplete(xpAwarded, gameState.current.sessionLearnedWords);
      onExit();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 overflow-hidden font-sans">
      {/* Game Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      {/* UI Overlay (Top) */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-2">
            <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl text-white border border-white/20 flex items-center gap-3">
                <Trophy className="text-yellow-400" />
                <div>
                    <p className="text-xs uppercase opacity-70 font-bold">Skor</p>
                    <p className="text-2xl font-mono font-bold leading-none">{score}</p>
                </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-2 rounded-xl text-white border border-white/20 text-xs text-center">
                Seviye {level}
            </div>
        </div>

        <button 
            onClick={onExit} 
            className="pointer-events-auto p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
            <X size={24} />
        </button>
      </div>

      {/* Lives Indicator */}
      <div className="absolute top-6 flex gap-2 pointer-events-none">
         {[...Array(3)].map((_, i) => (
             <Heart 
                key={i} 
                fill={i < lives ? "#ef4444" : "transparent"} 
                className={`transition-all duration-300 ${i < lives ? "text-red-500" : "text-gray-600"}`}
                size={32}
             />
         ))}
      </div>

      {/* Input Area (Bottom) */}
      {!gameOver && (
        <div className="absolute bottom-10 w-full max-w-md px-4">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Keyboard className="text-gray-400" />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        checkInput(e.target.value); // Check on change for faster gameplay
                    }}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="block w-full pl-10 p-4 rounded-2xl bg-white/90 backdrop-blur text-gray-900 text-lg font-bold shadow-2xl border-2 border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                    placeholder="Türkçe anlamını yaz..."
                />
                <div className="absolute right-3 top-3">
                     <span className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-1 rounded">ENTER</span>
                </div>
            </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full animate-pop-in border-4 border-indigo-500">
                  <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
                  <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Oyun Bitti!</h2>
                  <p className="text-gray-500 mb-4">Kelimeler seni yendi.</p>
                  
                  {gameState.current.sessionLearnedWords.length > 0 && (
                      <div className="mb-4 p-2 bg-green-50 rounded-lg border border-green-100">
                          <p className="text-green-700 font-bold text-sm">
                              +{gameState.current.sessionLearnedWords.length} Yeni Kelime Belleğe Eklendi!
                          </p>
                      </div>
                  )}

                  <div className="bg-indigo-50 p-4 rounded-xl mb-6">
                      <p className="text-sm text-gray-500 uppercase font-bold">Toplam Skor</p>
                      <p className="text-4xl font-black text-indigo-600">{score}</p>
                  </div>

                  <button 
                    onClick={handleGameOverExit}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg"
                  >
                    Devam Et
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

// Expanded Fallback Vocab - A1/A2 Level (60 Words)
const FALLBACK_VOCAB: Vocabulary[] = [
    { fr: "bonjour", tr: "merhaba", pos: "int", audio_tts: "" },
    { fr: "chat", tr: "kedi", pos: "noun", audio_tts: "" },
    { fr: "chien", tr: "köpek", pos: "noun", audio_tts: "" },
    { fr: "maison", tr: "ev", pos: "noun", audio_tts: "" },
    { fr: "rouge", tr: "kırmızı", pos: "adj", audio_tts: "" },
    { fr: "bleu", tr: "mavi", pos: "adj", audio_tts: "" },
    { fr: "pain", tr: "ekmek", pos: "noun", audio_tts: "" },
    { fr: "eau", tr: "su", pos: "noun", audio_tts: "" },
    { fr: "ami", tr: "arkadaş", pos: "noun", audio_tts: "" },
    { fr: "oui", tr: "evet", pos: "int", audio_tts: "" },
    { fr: "non", tr: "hayır", pos: "int", audio_tts: "" },
    { fr: "amour", tr: "aşk", pos: "noun", audio_tts: "" },
    { fr: "merci", tr: "teşekkürler", pos: "int", audio_tts: "" },
    { fr: "nuit", tr: "gece", pos: "noun", audio_tts: "" },
    { fr: "jour", tr: "gün", pos: "noun", audio_tts: "" },
    { fr: "homme", tr: "adam", pos: "noun", audio_tts: "" },
    { fr: "femme", tr: "kadın", pos: "noun", audio_tts: "" },
    { fr: "enfant", tr: "çocuk", pos: "noun", audio_tts: "" },
    { fr: "manger", tr: "yemek", pos: "verb", audio_tts: "" },
    { fr: "boire", tr: "içmek", pos: "verb", audio_tts: "" },
    { fr: "livre", tr: "kitap", pos: "noun", audio_tts: "" },
    { fr: "voiture", tr: "araba", pos: "noun", audio_tts: "" },
    { fr: "porte", tr: "kapı", pos: "noun", audio_tts: "" },
    { fr: "fenêtre", tr: "pencere", pos: "noun", audio_tts: "" },
    { fr: "noir", tr: "siyah", pos: "adj", audio_tts: "" },
    { fr: "blanc", tr: "beyaz", pos: "adj", audio_tts: "" },
    { fr: "soleil", tr: "güneş", pos: "noun", audio_tts: "" },
    { fr: "lune", tr: "ay", pos: "noun", audio_tts: "" },
    { fr: "un", tr: "bir", pos: "num", audio_tts: "" },
    { fr: "deux", tr: "iki", pos: "num", audio_tts: "" },
    { fr: "trois", tr: "üç", pos: "num", audio_tts: "" },
    { fr: "père", tr: "baba", pos: "noun", audio_tts: "" },
    { fr: "mère", tr: "anne", pos: "noun", audio_tts: "" },
    { fr: "frère", tr: "erkek kardeş", pos: "noun", audio_tts: "" },
    { fr: "soeur", tr: "kız kardeş", pos: "noun", audio_tts: "" },
    { fr: "pomme", tr: "elma", pos: "noun", audio_tts: "" },
    { fr: "lait", tr: "süt", pos: "noun", audio_tts: "" },
    { fr: "café", tr: "kahve", pos: "noun", audio_tts: "" },
    { fr: "table", tr: "masa", pos: "noun", audio_tts: "" },
    { fr: "chaise", tr: "sandalye", pos: "noun", audio_tts: "" },
    { fr: "lit", tr: "yatak", pos: "noun", audio_tts: "" },
    { fr: "grand", tr: "büyük", pos: "adj", audio_tts: "" },
    { fr: "petit", tr: "küçük", pos: "adj", audio_tts: "" },
    { fr: "bon", tr: "iyi", pos: "adj", audio_tts: "" },
    { fr: "mauvais", tr: "kötü", pos: "adj", audio_tts: "" },
    { fr: "aller", tr: "gitmek", pos: "verb", audio_tts: "" },
    { fr: "voir", tr: "görmek", pos: "verb", audio_tts: "" },
    { fr: "faire", tr: "yapmak", pos: "verb", audio_tts: "" },
    { fr: "aimer", tr: "sevmek", pos: "verb", audio_tts: "" },
    { fr: "école", tr: "okul", pos: "noun", audio_tts: "" },
    { fr: "ville", tr: "şehir", pos: "noun", audio_tts: "" },
    { fr: "rue", tr: "sokak", pos: "noun", audio_tts: "" },
    { fr: "sac", tr: "çanta", pos: "noun", audio_tts: "" },
    { fr: "argent", tr: "para", pos: "noun", audio_tts: "" },
    { fr: "stylo", tr: "kalem", pos: "noun", audio_tts: "" },
    { fr: "heure", tr: "saat", pos: "noun", audio_tts: "" },
    { fr: "temps", tr: "zaman", pos: "noun", audio_tts: "" },
    { fr: "année", tr: "yıl", pos: "noun", audio_tts: "" },
    { fr: "garçon", tr: "oğlan", pos: "noun", audio_tts: "" },
    { fr: "fille", tr: "kız", pos: "noun", audio_tts: "" }
];

export default WordRainGame;