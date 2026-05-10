import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { getQAResponse, checkOllamaStatus, ChatMessage } from '../services/ollamaService';

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## '))
          return <h3 key={i} className="text-sm font-semibold text-text mt-2 mb-0.5">{line.slice(3)}</h3>;
        if (line.startsWith('### '))
          return <h4 key={i} className="text-xs font-semibold text-text mt-1.5">{line.slice(4)}</h4>;
        if (line.startsWith('**') && line.endsWith('**') && line.length > 4)
          return <p key={i} className="font-semibold text-primary text-xs">{line.slice(2, -2)}</p>;
        if (line.startsWith('- ') || line.startsWith('• '))
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-primary mt-0.5 shrink-0 text-xs">•</span>
              <span className="text-textMuted text-xs">{renderBold(line.slice(2))}</span>
            </div>
          );
        if (line.trim() === '') return <div key={i} className="h-0.5" />;
        return <p key={i} className="text-textMuted text-xs">{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="text-text font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

interface Message {
  role: 'user' | 'ai';
  text: string;
}

const AIChatPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && ollamaOnline === null) {
      checkOllamaStatus().then(s => setOllamaOnline(s.online));
    }
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    const history: ChatMessage[] = updated.map(m => ({ role: m.role, text: m.text }));
    const reply = await getQAResponse(text, history.slice(0, -1));

    setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        title="Ask your data"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl overflow-hidden"
         style={{ height: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surfaceHighlight bg-surfaceHighlight/30">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <span className="font-semibold text-text text-sm">Ask Your Data</span>
          {ollamaOnline !== null && (
            <span className={`w-2 h-2 rounded-full ${ollamaOnline ? 'bg-success' : 'bg-danger'}`} />
          )}
        </div>
        <button onClick={() => setIsOpen(false)} className="text-textMuted hover:text-text transition-colors p-1 rounded hover:bg-surfaceHighlight">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <Bot size={36} className="text-primary/40" />
            <div>
              <p className="text-textMuted text-sm font-medium">Ask anything about your trading data</p>
              <p className="text-textMuted/60 text-xs mt-1.5">Try: "What's my P&L this week?" or "Which setup has the best win rate?"</p>
            </div>
            {ollamaOnline === false && (
              <div className="mt-2 text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
                Ollama is offline. Run <code className="bg-surfaceHighlight px-1 rounded">ollama serve</code> to enable AI.
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                <Bot size={14} className="text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-surfaceHighlight text-text rounded-bl-sm'
            }`}>
              {msg.role === 'ai' ? <MarkdownContent text={msg.text} /> : <p className="text-sm">{msg.text}</p>}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-surfaceHighlight flex items-center justify-center shrink-0 mt-1">
                <User size={14} className="text-textMuted" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="bg-surfaceHighlight rounded-xl rounded-bl-sm px-3 py-2">
              <Loader2 size={16} className="text-primary animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surfaceHighlight px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your trades..."
            rows={1}
            className="flex-1 bg-surfaceHighlight border border-surfaceHighlight rounded-xl px-3 py-2 text-sm text-text placeholder-textMuted/50 resize-none focus:outline-none focus:border-primary transition-colors"
            style={{ maxHeight: '80px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-primary/80 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
