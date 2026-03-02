import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatWindow({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [model, setModel] = useState<'fast' | 'smart'>('fast');
    const [isThinking, setIsThinking] = useState(false);
    const [loadingText, setLoadingText] = useState('Analyzing EarthMC data...');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsThinking(false);
        }
    };

    useEffect(() => {
        const loadingPhrases = [
            "Analyzing EarthMC data...",
            "Crawling the database...",
            "Filtering town records...",
            "Fetching player history...",
            "Compiling server statistics...",
            "Parsing nation lists...",
            "Scamming noobs for gold...",
            "Cracking EarthMC servers...",
            "Contacting Fix...",
            "Looking for dupes...",
            "Plotting against humans...",
            "Stealing your girl...",
            "Laundering gold...",
            "Stealing Mystery Crates..."
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

        abortControllerRef.current = new AbortController();

        // Add a temporary empty assistant message to stream into
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    messages: [...messages, { role: 'user', content: userMsg }].map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    model: model
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
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return;
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

    const renderMessageContent = (content: string, role: 'user' | 'assistant', isLastMessage: boolean) => {
        const parts = content.split(/(\[(?:thought|query)[^\]]*\])/g).filter(Boolean);

        type Group = { type: 'group'; items: string[] };
        type TextItem = { type: 'text'; content: string };
        const groupedParts: (Group | TextItem)[] = [];

        // Single master group for all thoughts/queries
        const masterGroupItems: string[] = [];
        const textParts: string[] = [];

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.startsWith('[query:') || part.startsWith('[thought:')) {
                masterGroupItems.push(part);
            } else if (part.trim() !== '') {
                // Collect actual text separate from thoughts
                textParts.push(part);
            }
        }

        if (masterGroupItems.length > 0) {
            groupedParts.push({ type: 'group', items: masterGroupItems });
        }

        if (textParts.length > 0) {
            groupedParts.push({ type: 'text', content: textParts.join('') });
        }

        let globalActionPinCount = 0;
        const allCollectedActions: { type: 'map' | 'path', content: string, args: string[] }[] = [];

        const renderedGroups = groupedParts.map((group, groupIdx) => {
            if (group.type === 'group' && group.items.length > 0) {
                return (
                    <details key={`grp-${groupIdx}`} className="group my-2 bg-black/20 border border-white/[0.03] rounded-xl overflow-hidden w-full text-xs shadow-sm">
                        <summary className="px-3 py-2 flex items-center justify-between text-white/50 hover:text-white/70 hover:bg-white/[0.02] select-none outline-none font-medium cursor-pointer transition-colors">
                            <div className="flex items-center gap-2 text-[11.5px]">
                                {isThinking && role === 'assistant' && isLastMessage ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-earthmc-green/60 animate-spin" style={{ animationDuration: '3s' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                                        <span className="tracking-wide">Agent Thinking</span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-earthmc-green/60"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        <span className="tracking-wide text-earthmc-green/60">Finished Thinking</span>
                                    </>
                                )}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 group-open:rotate-180 transition-transform duration-200"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </summary>
                        <div className="px-3 pb-3 pt-1 text-white/60 leading-relaxed border-t border-white/[0.03] bg-black/10 italic flex flex-col gap-2 cursor-text">
                            {group.items.map((item, itemIdx) => {
                                if (item.startsWith('[query:')) {
                                    return (
                                        <div key={itemIdx} className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-2.5">
                                            <div className="flex items-center gap-1.5 mb-1.5 text-blue-400 font-semibold not-italic text-[11px]">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                                                <span>Querying Database</span>
                                            </div>
                                            <div className="text-white/60 ml-0.5 text-[11.5px] leading-relaxed">{item.slice(7, -1)}</div>
                                        </div>
                                    );
                                }
                                if (item.startsWith('[thought:')) {
                                    return (
                                        <div key={itemIdx} className="bg-white/5 rounded-lg p-2.5">
                                            <div className="flex items-center gap-1.5 mb-1.5 text-white/40 font-semibold not-italic text-[11px]">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                                                <span>Agent Thought</span>
                                            </div>
                                            <div className="text-white/50 ml-0.5 text-[11.5px] leading-relaxed">{item.slice(9, -1)}</div>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </details>
                );
            }

            if (group.type === 'text') {
                const part = group.content;
                if (!part) return null;

                // Hide the actual response text if the agent is still thinking (and we are the assistant)
                if (role === 'assistant' && isThinking && isLastMessage) return null;

                const renderedContent: React.ReactNode[] = [];

                const lines = part.split('\n');

                // Shift initial empty newlines so we don't render a big forehead
                while (lines.length > 0 && lines[0].trim() === '') {
                    lines.shift();
                }

                // Pop trailing empty newlines so we don't render dead space at bottom
                while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                    lines.pop();
                }

                if (lines.length === 0) {
                    return null;
                }

                lines.forEach((line, lineIdx) => {
                    const lineParts = line.split(/(\[(?:player|town|nation|action)[^\]]*\])/g).filter(Boolean);
                    lineParts.forEach((subPart, subPartIdx) => {
                        if (subPart.startsWith('[player:')) {
                            const name = subPart.slice(8, -1);
                            renderedContent.push(<span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`} onClick={() => window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'players', search: name } }))} className="text-earthmc-green hover:underline cursor-pointer font-semibold">{name}</span>);
                        } else if (subPart.startsWith('[town:')) {
                            const name = subPart.slice(6, -1);
                            renderedContent.push(<span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`} onClick={() => window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'towns', search: name } }))} className="text-amber-400 hover:underline cursor-pointer font-semibold">{name}</span>);
                        } else if (subPart.startsWith('[nation:')) {
                            const name = subPart.slice(8, -1);
                            renderedContent.push(<span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`} onClick={() => window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'nations', search: name } }))} className="text-blue-400 hover:underline cursor-pointer font-semibold">{name}</span>);
                        } else if (subPart.startsWith('[action:map:')) {
                            const args = subPart.slice(12, -1).split(':');
                            if (args.length === 2) {
                                globalActionPinCount++;
                                allCollectedActions.push({ type: 'map', content: subPart, args });
                                renderedContent.push(
                                    <span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`} className="inline-flex items-center gap-0.5 text-blue-400 font-semibold text-xs px-1 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 mx-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
                                        {globalActionPinCount}
                                    </span>
                                );
                            }
                        } else if (subPart.startsWith('[action:path:')) {
                            const args = subPart.slice(13, -1).split(':');
                            if (args.length >= 2) {
                                globalActionPinCount++;
                                allCollectedActions.push({ type: 'path', content: subPart, args });
                                renderedContent.push(
                                    <span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`} className="inline-flex items-center gap-0.5 text-red-400 font-semibold text-xs px-1 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 mx-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" /></svg>
                                        {globalActionPinCount}
                                    </span>
                                );
                            }
                        } else {
                            renderedContent.push(<span key={`text-${groupIdx}-${lineIdx}-${subPartIdx}`}>{subPart}</span>);
                        }
                    });
                    if (lineIdx !== lines.length - 1) {
                        renderedContent.push(<br key={`br-${groupIdx}-${lineIdx}`} />);
                    }
                });

                return (
                    <div key={`text-group-${groupIdx}`}>
                        {renderedContent}
                    </div>
                );
            }
            return null;
        });

        return (
            <>
                {renderedGroups}
                {allCollectedActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-white/5">
                        {allCollectedActions.map((action, actionIdx) => {
                            if (action.type === 'map') {
                                const [x, z] = action.args;
                                return (
                                    <button key={`action-map-${actionIdx}`} onClick={() => window.dispatchEvent(new CustomEvent('fly-to-map', { detail: { lat: -Number(z) / 8, lng: Number(x) / 8 } }))} className="inline-flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
                                        Show on Map ({actionIdx + 1})
                                    </button>
                                );
                            }
                            if (action.type === 'path') {
                                const uuid = action.args[0];
                                const name = action.args.slice(1).join(':');
                                return (
                                    <button key={`action-path-${actionIdx}`} onClick={() => window.dispatchEvent(new CustomEvent('show-player-path', { detail: { player_uuid: uuid, player_name: name } }))} className="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" /></svg>
                                        Draw Path ({actionIdx + 1})
                                    </button>
                                );
                            }
                            return null;
                        })}
                    </div>
                )}
            </>
        );
    };


    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: "-40%", x: "-50%" }}
                    animate={{ opacity: 1, y: "-50%", x: "-50%" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="fixed top-1/2 left-1/2 w-[400px] md:w-[750px] max-w-[calc(100vw-2rem)] h-[550px] max-h-[calc(100vh-8rem)] liquid-glass flex flex-col rounded-2xl border border-white/10 shadow-2xl z-[1000] pointer-events-auto"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center p-3 px-4 border-b border-white/5 bg-black/20 rounded-t-2xl">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full border border-earthmc-green/30 bg-earthmc-green/10 flex items-center justify-center text-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.1)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
                                </div>
                                <span className="font-medium text-white tracking-wide text-sm">Agent</span>
                            </div>
                            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10">
                                <button
                                    onClick={() => setModel('fast')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${model === 'fast' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                                    title="Faster responses, standard reasoning"
                                >
                                    Fast
                                </button>
                                <button
                                    onClick={() => setModel('smart')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${model === 'smart' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                                    title="Deeper reasoning, slightly slower"
                                >
                                    Smart
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => {
                                    handleStop();
                                    setMessages([]);
                                    setInput('');
                                }}
                                title="New Chat"
                                className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"></path></svg>
                            </button>
                            <button
                                onClick={onClose}
                                title="Close Chat"
                                className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
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
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed tracking-wide ${msg.role === 'user'
                                        ? 'bg-white/10 text-white rounded-br-sm border border-white/10'
                                        : 'bg-black/20 text-gray-200 rounded-bl-sm border border-white/5 shadow-inner shadow-black/20'
                                        }`}
                                >
                                    {/* Tag parsed text rendering. */}
                                    {renderMessageContent(msg.content, msg.role, idx === messages.length - 1)}
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
                    <div className="p-3 border-t border-white/5 bg-black/20 rounded-b-2xl">
                        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isThinking}
                                placeholder="Message Agent..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all placeholder:text-white/30 disabled:opacity-50"
                            />
                            {isThinking ? (
                                <button
                                    type="button"
                                    onClick={handleStop}
                                    className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0 transition-all"
                                    title="Stop generating"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className="w-10 h-10 rounded-full bg-earthmc-green/10 hover:bg-earthmc-green/20 border border-earthmc-green/30 text-emerald-400 flex items-center justify-center shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed pr-0.5 pt-0.5"
                                    title="Send message"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                                </button>
                            )}
                        </form>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
