import React, { useCallback } from 'react';
import { Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  text: string;
  lang?: string;
  autoPlay?: boolean;
  className?: string;
  size?: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ text, lang = 'fr-FR', autoPlay = false, className, size = 24 }) => {
  const playAudio = useCallback(() => {
    if (!window.speechSynthesis) return;
    
    // Cancel any currently playing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85; // Slower for learners
    
    // Try to select a French voice if available
    const voices = window.speechSynthesis.getVoices();
    
    // Prefer Google Français or similar high quality voices
    const frenchVoice = voices.find(v => v.lang.includes('fr') && v.name.includes('Google')) || 
                        voices.find(v => v.lang.includes('fr'));
    
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, [text, lang]);

  React.useEffect(() => {
    if (autoPlay) {
      // Small delay to allow voices to load or UI to settle
      const timer = setTimeout(() => playAudio(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, playAudio]);

  return (
    <button 
      onClick={(e) => { e.stopPropagation(); playAudio(); }}
      className={`rounded-full flex items-center justify-center transition-transform active:scale-95 ${className || 'p-2 bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}
      aria-label="Play audio"
    >
      <Volume2 size={size} />
    </button>
  );
};

export default AudioPlayer;