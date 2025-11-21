import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Heart, Trophy, Keyboard } from 'lucide-react';
import { Vocabulary } from '../types';

interface WordRainGameProps {
  vocabulary: Vocabulary[];
  onExit: () => void;
  onComplete: (xp: number) => void;
}

interface FallingWord {
  id: number;
  textFr: string;
  textTr: string;
  x: number;
  y: number;
  speed: number;
  color: string;
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
    lastSpawnTime: 0,
    spawnRate: 2000, // ms
    score: 0,
    lives: 3,
    isPlaying: true,
    animationFrameId: 0,
    vocabList: vocabulary.length > 5 ? vocabulary : FALLBACK_VOCAB
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
    const { vocabList } = gameState.current;
    const randomVocab = vocabList[Math.floor(Math.random() * vocabList.length)];
    
    // Ensure text fits within canvas width (padding 20px)
    const x = Math.random() * (width - 100) + 20;
    
    const baseSpeed = 0.5 + (gameState.current.score / 500); // Increase speed with score
    
    const word: FallingWord = {
      id: Date.now() + Math.random(),
      textFr: randomVocab.fr,
      textTr: randomVocab.tr,
      x: x,
      y: -30,
      speed: baseSpeed + Math.random() * 0.5,
      color: '#ffffff'
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
      gameState.current.spawnRate = Math.max(500, 2000 - (gameState.current.score * 2));
      
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
      onComplete(xpAwarded);
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
                  <p className="text-gray-500 mb-6">Kelimeler seni yendi.</p>
                  
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

// Fallback data if user has no learned words yet
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
    { fr: "amour", tr: "aşk", pos: "noun", audio_tts: "" }
];

export default WordRainGame;
