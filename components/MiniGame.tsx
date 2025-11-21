import React, { useState, useEffect } from 'react';
import { Game, Vocabulary } from '../types';
import AudioPlayer from './AudioPlayer';

interface MiniGameProps {
  game: Game;
  vocab: Vocabulary[];
  onComplete: (score: number) => void;
}

const MiniGame: React.FC<MiniGameProps> = ({ game, vocab, onComplete }) => {
  // Select 4 random words for the game
  const [gameItems, setGameItems] = useState<{ id: string, text: string, type: 'fr' | 'tr', matchId: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (vocab.length === 0) return;

    const words = vocab.slice(0, 4);
    const items: { id: string, text: string, type: 'fr' | 'tr', matchId: string }[] = [];
    
    words.forEach((w, i) => {
      items.push({ id: `fr-${i}`, text: w.fr, type: 'fr', matchId: `pair-${i}` });
      items.push({ id: `tr-${i}`, text: w.tr, type: 'tr', matchId: `pair-${i}` });
    });

    // Shuffle
    setGameItems(items.sort(() => Math.random() - 0.5));
  }, [vocab]);

  useEffect(() => {
    // Fix: Don't run game logic until items are initialized to prevent immediate game over
    if (gameItems.length === 0) return;

    if (timeLeft > 0 && !gameOver && matches.size < gameItems.length) {
      const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 || matches.size === gameItems.length) {
      setGameOver(true);
      const timeoutId = setTimeout(() => {
        // Only award XP if all items were matched
        const success = matches.size === gameItems.length;
        onComplete(success ? game.reward_xp : 0);
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [timeLeft, matches, gameItems.length, onComplete, game.reward_xp, gameOver]);

  const handleCardClick = (id: string, matchId: string) => {
    if (gameOver || matches.has(id)) return;

    if (selectedId === null) {
      setSelectedId(id);
    } else {
      const prevSelected = gameItems.find(i => i.id === selectedId);
      if (prevSelected && prevSelected.matchId === matchId && prevSelected.id !== id) {
        // Match found
        setMatches(prev => {
            const newSet = new Set(prev);
            newSet.add(id);
            newSet.add(selectedId);
            return newSet;
        });
        setSelectedId(null);
        
        // Sound effect
        const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
        audio.volume = 0.2;
        audio.play().catch(() => {});
      } else {
        // No match
        setSelectedId(null);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-2xl shadow-xl border-2 border-indigo-100 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-indigo-800">Eşleştirme Oyunu</h3>
        <span className={`font-mono text-lg font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-600'}`}>
          {timeLeft}s
        </span>
      </div>
      
      {gameOver ? (
        <div className="text-center py-10 animate-pop-in">
          <h4 className="text-2xl font-bold mb-2">Oyun Bitti!</h4>
          <p className="text-gray-600">
            {matches.size === gameItems.length ? `Harika! +${game.reward_xp} XP` : 'Süre doldu!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {gameItems.map((item, index) => {
            const isMatched = matches.has(item.id);
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleCardClick(item.id, item.matchId)}
                className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 transition-all duration-200 border-b-4 animate-pop-in
                  ${isMatched ? 'bg-green-100 border-green-400 opacity-50 cursor-default scale-95' : 
                    isSelected ? 'bg-indigo-200 border-indigo-500 transform scale-95' : 
                    'bg-gray-50 border-gray-200 hover:bg-gray-100 active:scale-95'}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="text-lg font-medium text-gray-800">{item.text}</span>
                {item.type === 'fr' && <AudioPlayer text={item.text} size={16} className="mt-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MiniGame;