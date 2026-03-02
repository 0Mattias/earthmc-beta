import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ChatWindow({ onClose }: { onClose: () => void }) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [loadingText, setLoadingText] = useState('Analyzing EarthMC data...');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadingPhrases = [
            "Analyzing EarthMC data...",
            "Querying the database...",
            "Looking up town records...",
            "Fetching player history...",
            "Compiling server statistics...",
            "Parsing nation lists..."
        ];

        let interval: NodeJS.Timeout;
        if (isThinking) {
            let phraseIndex = 0;
            interval = setInterval(() => {
                phraseIndex = (phraseIndex + 1) % loadingPhrases.length;
                setLoadingText(loadingPhrases[phraseIndex]);
            }, 2500);
        }
        return () => clearInterval(interval);
    }, [isThinking]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isThinking]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isThinking) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsThinking(true);

        // Add a temporary empty assistant message to stream into
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, { role: 'user', content: userMsg }].map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                })
            });

            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunkValue = decoder.decode(value);

                if (chunkValue) {
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const lastMsg = newMessages[newMessages.length - 1];
                        if (lastMsg.role === 'assistant') {
                            lastMsg.content += chunkValue;
                        }
                        return newMessages;
                    });
                }
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.content === '') {
                    lastMsg.content = "I encountered an error connecting to the database.";
                }
                return newMessages;
            });
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-24 right-6 w-96 h-[500px] liquid-glass flex flex-col rounded-2xl border border-white/20 shadow-2xl overflow-hidden z-[1000] pointer-events-auto"
        >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/40">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-earthmc-green to-emerald-600 flex items-center justify-center p-0.5">
                        <div className="w-full h-full bg-black/50 rounded-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
                        </div>
                    </div>
                    <span className="font-bold text-white tracking-wide">EarthMC Agent</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-70">
                        <div className="w-16 h-16 mb-4 opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white w-full h-full"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>
                        </div>
                        <p className="text-white text-sm">Ask me about EarthMC players, towns, or server stats.</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2 ${msg.role === 'user'
                                ? 'bg-earthmc-green/80 text-white rounded-br-sm'
                                : 'bg-white/10 text-gray-100 rounded-bl-sm border border-white/5'
                                } text-sm leading-relaxed`}
                        >
                            {/* Simple text rendering. */}
                            {msg.content.split('\n').map((line, i) => (
                                <span key={i}>
                                    {line}
                                    {i !== msg.content.split('\n').length - 1 && <br />}
                                </span>
                            ))}
                            {msg.role === 'assistant' && msg.content === '' && isThinking && (
                                <div className="flex items-center gap-3 h-6 text-earthmc-green font-medium">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        className="w-5 h-5 flex items-center justify-center shrink-0"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                                            <path d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z" />
                                        </svg>
                                    </motion.div>
                                    <motion.span
                                        key={loadingText}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 1, 1, 0] }}
                                        transition={{ duration: 2.5, times: [0, 0.2, 0.8, 1] }}
                                    >
                                        {loadingText}
                                    </motion.span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-black/20 border-t border-white/10">
                <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isThinking}
                        placeholder="Search the database..."
                        className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all placeholder:text-white/40 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isThinking || !input.trim()}
                        className="w-10 h-10 rounded-full bg-earthmc-green/80 hover:bg-earthmc-green text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(74,222,128,0.3)]"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5"><line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </button>
                </form>
            </div>
        </motion.div>
    );
}
