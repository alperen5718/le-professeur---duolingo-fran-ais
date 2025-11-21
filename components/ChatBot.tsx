import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { getChatResponse } from '../services/geminiService';

interface Message {
  role: 'user' | 'bot';
  text: string;
}

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: 'Merhaba! Ben Fransızca asistanınım. Takıldığın bir yer var mı?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    const response = await getChatResponse(userMsg);
    
    setMessages(prev => [...prev, { role: 'bot', text: response }]);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end pointer-events-none">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden pointer-events-auto animate-pop-in origin-bottom-right flex flex-col max-h-96">
          <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center space-x-2">
                <Bot size={20} />
                <span className="font-bold">Asistan</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-indigo-700 p-1 rounded">
                <X size={18} />
            </button>
          </div>
          
          <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-3 min-h-[200px]">
            {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'}`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            {isTyping && (
                <div className="flex justify-start">
                    <div className="bg-gray-200 p-3 rounded-xl rounded-bl-none">
                        <Loader2 size={16} className="animate-spin text-gray-500" />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-gray-100 flex items-center space-x-2">
            <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Bir soru sor..."
                className="flex-grow p-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700">
                <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
};

export default ChatBot;