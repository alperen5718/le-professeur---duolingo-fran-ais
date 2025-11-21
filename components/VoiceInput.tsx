import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

// Define SpeechRecognition types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface VoiceInputProps {
  onResult: (transcript: string) => void;
  isListeningProp?: boolean;
  lang?: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onResult, isListeningProp, lang = 'fr-FR' }) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const recognitionInstance = new SpeechRecognitionAPI();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = lang;

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          onResult(transcript);
        }
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setError('Ses algılanamadı.');
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    } else {
      setError('Browser not supported');
    }
  }, [lang, onResult]);

  const toggleListening = () => {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setError(null);
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={toggleListening}
        className={`p-4 rounded-full shadow-lg transition-all transform active:scale-95 ${
          isListening 
            ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isListening ? <Loader2 className="animate-spin" size={32} /> : <Mic size={32} />}
      </button>
      {isListening && <p className="text-sm text-gray-500 mt-2">Dinliyorum...</p>}
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
};

export default VoiceInput;