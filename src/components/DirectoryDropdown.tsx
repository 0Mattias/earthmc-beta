'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DirectoryItem {
    name: string | { name: string; uuid?: string };
    nation?: string | { name: string; uuid?: string };
    town?: string | { name: string; uuid?: string };
    uuid?: string;
    location?: { x: number; z: number };
    status?: {
        isOnline?: boolean;
        isHidden?: boolean;
        hasTown?: boolean;
        hasNation?: boolean;
        isMayor?: boolean;
        isKing?: boolean;
        isOpen?: boolean;
        isPublic?: boolean;
        isCapital?: boolean;
        isOverClaimed?: boolean;
        isNPC?: boolean;
    };
    stats?: {
        balance?: number | string;
        numResidents?: number | string;
        numTownBlocks?: number | string;
        maxTownBlocks?: number | string;
        numTowns?: number | string;
        numAllies?: number | string;
        numEnemies?: number | string;
    };
    timestamps?: {
        registered?: number | string;
        lastOnline?: number | string;
    };
    title?: string;
    ranks?: {
        townRanks?: string[];
        nationRanks?: string[];
    };
    coordinates?: {
        homeBlock?: [number, number];
        spawn?: { x: number; z: number };
    };
    capital?: { name: string };
    mayor?: string | { name: string };
    king?: string | { name: string };
    perms?: {
        flags?: {
            pvp?: boolean;
            mobs?: boolean;
            fire?: boolean;
            explosion?: boolean;
        }
    };
    board?: string;
    [key: string]: unknown;
}

export default function DirectoryDropdown({ activeTab, initialSearch = '' }: { activeTab: string, initialSearch?: string }) {
    const [data, setData] = useState<DirectoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(activeTab === 'players' ? 'desc' : 'asc');
    const [sortBy, setSortBy] = useState<string>(activeTab === 'players' ? 'online' : 'name');
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const itemsPerPage = 20; // 2 columns * 10 rows

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentPage]);

    useEffect(() => {
        if (initialSearch) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSearchQuery(initialSearch);
        }
    }, [initialSearch]);

    const [prevTab, setPrevTab] = useState(activeTab);

    useEffect(() => {
        if (activeTab !== prevTab) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPrevTab(activeTab);
            setCurrentPage(1);
            setSearchQuery(initialSearch || '');
            setDebouncedSearch(initialSearch || '');
            setExpandedItem(null);
            setData([]);
            setSortOrder(activeTab === 'players' ? 'desc' : 'asc');
            setSortBy(activeTab === 'players' ? 'online' : 'name');
        }
    }, [activeTab, prevTab, initialSearch]);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1); // Reset page on new search
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    useEffect(() => {
        const handleOpenDirectory = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.search) {
                setSearchQuery(customEvent.detail.search);
            }
        };

        const handleMapPlayersUpdate = (e: Event) => {
            if (activeTab !== 'players') return;
            const customEvent = e as CustomEvent;
            const liveMap: Map<string, { x: number; z: number }> = customEvent.detail;
            if (!liveMap) return;

            setData((currentData: DirectoryItem[]) => {
                let hasChanges = false;
                const newData = currentData.map((item: DirectoryItem) => {
                    const itemName = typeof item.name === 'object' && item.name !== null ? item.name.name : (item.name as string);
                    const itemUuid = (item.uuid as string) || itemName;

                    const livePlayer = liveMap.get(itemUuid);
                    if (livePlayer) {
                        const existingLocation = item.location;
                        const existingOnline = item.status?.isOnline;

                        // Only update state if coordinates or online status actually changed to prevent excessive re-renders
                        if (!existingOnline || !existingLocation || existingLocation.x !== Math.round(livePlayer.x) || existingLocation.z !== Math.round(livePlayer.z)) {
                            hasChanges = true;
                            return {
                                ...item,
                                status: { ...item.status, isOnline: true },
                                location: { x: Math.round(livePlayer.x), z: Math.round(livePlayer.z) }
                            };
                        }
                    }
                    return item;
                });
                return hasChanges ? newData : currentData;
            });
        };

        window.addEventListener('open-directory', handleOpenDirectory);
        window.addEventListener('map-players-update', handleMapPlayersUpdate);
        return () => {
            window.removeEventListener('open-directory', handleOpenDirectory);
            window.removeEventListener('map-players-update', handleMapPlayersUpdate);
        };
    }, [activeTab]);

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            if (isMounted) setLoading(true);
            try {
                const res = await fetch(`/api/${activeTab}?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(debouncedSearch)}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
                const responseData = await res.json();

                if (isMounted) {
                    setData(responseData.data || []);
                    if (responseData.pagination) {
                        setTotalPages(responseData.pagination.totalPages);
                        setTotalItems(responseData.pagination.total);
                    }
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [activeTab, currentPage, debouncedSearch, sortBy, sortOrder]);

    const getName = (item: DirectoryItem) => {
        return typeof item.name === 'object' && item.name !== null ? item.name.name : (item.name as string);
    };

    const getUuid = (item: DirectoryItem) => {
        return (item.uuid as string) || getName(item);
    };

    const handlePrev = () => setCurrentPage((p: number) => Math.max(1, p - 1));
    const handleNext = () => setCurrentPage((p: number) => Math.min(totalPages, p + 1));

    const renderPagination = () => (
        <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10 mt-3 mb-1">
            <button
                onClick={handlePrev}
                disabled={currentPage === 1 || loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
            >
                Previous
            </button>
            <span className="text-gray-300 font-medium">
                Page {currentPage} of {totalPages}
            </span>
            <button
                onClick={handleNext}
                disabled={currentPage === totalPages || loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
            >
                Next
            </button>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="liquid-glass w-full h-[75vh] max-h-[1000px] rounded-3xl p-4 sm:p-5 pb-2 sm:pb-3 flex flex-col shadow-2xl bg-black/20 border border-white/10"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-3 mb-3">
                <h2 className="text-2xl font-bold capitalize text-white flex items-center">
                    <span className="text-earthmc-green mr-2">{activeTab}</span>
                    Directory
                    {totalItems > 0 && (
                        <span className="ml-3 px-3 py-1 bg-white/10 rounded-full text-sm font-medium">
                            {totalItems} total
                        </span>
                    )}
                </h2>

                <div className="mt-4 sm:mt-0 flex items-center space-x-3">
                    <span className="text-gray-400 text-sm">Sort:</span>
                    <select
                        value={`${sortBy}|${sortOrder}`}
                        onChange={(e) => {
                            const [newSortBy, newSortOrder] = e.target.value.split('|');
                            setSortBy(newSortBy);
                            setSortOrder(newSortOrder as 'asc' | 'desc');
                            setCurrentPage(1); // Reset to first page on sort change
                        }}
                        className="bg-black/40 border border-white/10 text-white text-sm rounded-lg focus:ring-earthmc-green focus:border-earthmc-green block p-2 backdrop-blur-md outline-none"
                    >
                        <option value="name|asc">Name (A-Z)</option>
                        <option value="name|desc">Name (Z-A)</option>
                        {activeTab === 'players' && <option value="online|desc">Online / Last Seen</option>}
                        {activeTab === 'players' && <option value="balance|desc">Wealth (High-Low)</option>}
                        {activeTab === 'towns' && <option value="balance|desc">Wealth (High-Low)</option>}
                        {activeTab === 'towns' && <option value="residents|desc">Residents (High-Low)</option>}
                        {activeTab === 'nations' && <option value="balance|desc">Wealth (High-Low)</option>}
                        {activeTab === 'nations' && <option value="residents|desc">Residents (High-Low)</option>}
                        {activeTab === 'nations' && <option value="towns|desc">Towns (High-Low)</option>}
                    </select>
                </div>
            </div>

            <div className="mb-3 mt-1 relative">
                <input
                    type="text"
                    placeholder={`Search ${activeTab}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl focus:ring-earthmc-green focus:border-earthmc-green block p-3 pr-10 backdrop-blur-md outline-none placeholder-gray-500 transition-colors"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                        aria-label="Clear search"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                )}
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading && data.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-48 space-y-4">
                        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                            <motion.div
                                className="absolute top-0 bottom-0 left-0 w-1/2 bg-earthmc-green rounded-full"
                                animate={{ x: ["-100%", "200%"] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            />
                        </div>
                        <span className="text-gray-400 text-sm font-medium animate-pulse">This may take a moment...</span>
                    </div>
                ) : (
                    <div className={`flex flex-col gap-2 ${loading ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}`}>
                        {data.map((item: DirectoryItem, idx) => {
                            const itemName = getName(item);
                            const itemUuid = getUuid(item) || idx.toString();
                            const isExpanded = expandedItem === itemUuid;

                            const townName = typeof item.town === 'object' && item.town !== null ? item.town.name : item.town as string | undefined;
                            const nationName = typeof item.nation === 'object' && item.nation !== null ? item.nation.name : item.nation as string | undefined;

                            return (
                                <motion.div
                                    layout
                                    key={itemUuid}
                                    onClick={() => setExpandedItem(isExpanded ? null : itemUuid)}
                                    className={`group bg-black/20 border ${isExpanded ? 'border-earthmc-green/30 bg-black/40' : 'border-white/[0.05]'} hover:border-earthmc-green/30 hover:bg-black/30 backdrop-blur-md shadow-lg transition-all duration-300 rounded-2xl overflow-hidden cursor-pointer flex flex-col`}
                                >
                                    <motion.div layout className="px-4 py-3 flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <div className="font-bold text-base text-white truncate max-w-[70%] group-hover:text-earthmc-green transition-colors">
                                                {itemName}
                                            </div>
                                            {activeTab === 'players' && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 transition-colors ${(item.status?.isOnline && !item.status?.isHidden)
                                                    ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/30 shadow-[0_0_8px_rgba(74,222,128,0.15)]'
                                                    : (item.status?.isOnline && item.status?.isHidden)
                                                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                                        : 'bg-white/5 text-gray-400 border-white/10'
                                                    }`}>
                                                    {(item.status?.isOnline && !item.status?.isHidden) ? 'Online' : (item.status?.isOnline && item.status?.isHidden) ? 'Last Seen' : 'Offline'}
                                                </span>
                                            )}
                                        </div>

                                        {activeTab === 'players' && (
                                            <div className="flex justify-between items-center mt-1">
                                                <div className="text-sm text-yellow-500/90 font-medium flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                                    {Number(item.stats?.balance || 0).toFixed(2)} G
                                                </div>
                                                <div className="text-xs font-mono text-gray-400 bg-black/30 border border-white/5 px-2 py-1 rounded-md min-w-[32px] text-center">
                                                    {item.location ? `${item.location.x}, ${item.location.z}` : '?'}
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'towns' && (
                                            <div className="flex justify-between items-center mt-1">
                                                <div className="text-sm text-yellow-500/90 font-medium flex items-center gap-1 shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                                    {Number(item.stats?.balance || 0).toFixed(2)} G
                                                </div>
                                                {(item.coordinates?.homeBlock || item.coordinates?.spawn) ? (
                                                    <div className="text-xs font-mono text-gray-400 bg-black/30 border border-white/5 px-2 py-1 rounded-md min-w-[32px] text-center truncate ml-2">
                                                        {item.coordinates?.homeBlock ?
                                                            `${item.coordinates.homeBlock[0] * 16}, ${item.coordinates.homeBlock[1] * 16}` :
                                                            item.coordinates?.spawn ?
                                                                `${Math.round(item.coordinates.spawn.x)}, ${Math.round(item.coordinates.spawn.z)}` :
                                                                '?'
                                                        }
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-blue-400/80 font-medium truncate ml-2 border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 rounded-full">{nationName || 'None'}</div>
                                                )}
                                            </div>
                                        )}

                                        {activeTab === 'nations' && (
                                            <div className="flex justify-between items-center mt-1">
                                                <div className="text-sm text-yellow-500/90 font-medium flex items-center gap-1 shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                                    {Number(item.stats?.balance || 0).toFixed(2)} G
                                                </div>
                                                <div className="text-xs text-amber-500/80 font-medium truncate ml-2 border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                                    {item.capital?.name ? `${item.capital.name}` : '?'}
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="bg-black/50 border-t border-white/5 px-4 pb-4 pt-3"
                                            >
                                                {activeTab === 'players' && (
                                                    <div className="space-y-3 text-sm text-gray-300 mt-2">
                                                        {/* Relationships */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.title && <div className="flex justify-between"><span className="text-gray-500">Title</span><span className="text-right ml-4">{String(item.title).replace(/<[^>]*>?/gm, '')}</span></div>}
                                                            <div className="flex justify-between"><span className="text-gray-500">Town</span>{townName ? <span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'towns', search: townName } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{townName}</span> : <span className="text-gray-400 italic">None (Nomad)</span>}</div>
                                                            <div className="flex justify-between"><span className="text-gray-500">Nation</span>{nationName ? <span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'nations', search: nationName } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{nationName}</span> : <span className="text-gray-400 italic">None</span>}</div>
                                                            {item.ranks?.townRanks && item.ranks.townRanks.length > 0 && <div className="flex justify-between"><span className="text-gray-500">Town Ranks</span><span className="text-right ml-4">{item.ranks.townRanks.join(', ')}</span></div>}
                                                            {item.ranks?.nationRanks && item.ranks.nationRanks.length > 0 && <div className="flex justify-between"><span className="text-gray-500">Nation Ranks</span><span className="text-right ml-4">{item.ranks.nationRanks.join(', ')}</span></div>}
                                                        </div>

                                                        {/* Stats & Time */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.timestamps?.registered && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Registered</span><span className="text-right ml-4">{new Date(item.timestamps.registered).toLocaleDateString()}</span></div>
                                                            )}
                                                            {item.timestamps?.lastOnline && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Last Online</span><span className="text-right ml-4">{new Date(item.timestamps.lastOnline).toLocaleDateString()}</span></div>
                                                            )}
                                                        </div>

                                                        {/* Status Flags */}
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {item.status?.hasTown !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.hasTown ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{item.status.hasTown ? 'Has Town' : 'No Town'}</span>}
                                                            {item.status?.hasNation !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.hasNation ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{item.status.hasNation ? 'Has Nation' : 'No Nation'}</span>}
                                                            {item.status?.isMayor !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isMayor ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isMayor ? 'Mayor' : 'Not Mayor'}</span>}
                                                            {item.status?.isKing !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isKing ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isKing ? 'King' : 'Not King'}</span>}
                                                        </div>

                                                        {item.status?.isOnline && item.location && (
                                                            <div className="flex gap-2 mt-3 w-full">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        window.dispatchEvent(new CustomEvent('fly-to-map', {
                                                                            detail: {
                                                                                lat: -item.location!.z * (1 / 8),
                                                                                lng: item.location!.x * (1 / 8),
                                                                                player: {
                                                                                    player_uuid: getUuid(item),
                                                                                    player_name: getName(item),
                                                                                    x: item.location!.x,
                                                                                    z: item.location!.z,
                                                                                    is_online: item.status?.isOnline || false,
                                                                                    is_visible: !item.status?.isHidden,
                                                                                    last_seen: Date.now() // Directory doesn't convey exact last_seen timestamp yet, approx is fine for badge
                                                                                }
                                                                            }
                                                                        }));
                                                                        window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'app' } }));
                                                                    }}
                                                                    className="flex-1 py-2 bg-earthmc-green hover:bg-green-500 text-black font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-earthmc-green/20"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" x2="9" y1="3" y2="18"></line><line x1="15" x2="15" y1="6" y2="21"></line></svg>
                                                                    <span>Show on Map</span>
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        window.dispatchEvent(new CustomEvent('show-player-path', {
                                                                            detail: {
                                                                                player_uuid: getUuid(item),
                                                                                player_name: getName(item)
                                                                            }
                                                                        }));
                                                                        window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'app' } }));
                                                                    }}
                                                                    className="flex-1 py-2 bg-earthmc-green/20 hover:bg-earthmc-green/30 text-earthmc-green border border-earthmc-green/50 font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                                                                    <span>Show Path</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {activeTab === 'towns' && (
                                                    <div className="space-y-3 text-sm text-gray-300 mt-2">
                                                        {/* Relationships */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.mayor && typeof item.mayor === 'object' && 'name' in item.mayor && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Mayor</span><span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'players', search: String((item.mayor as { name: string }).name) } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{String((item.mayor as { name: string }).name)}</span></div>
                                                            )}
                                                            {nationName && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Nation</span><span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'nations', search: nationName } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{nationName}</span></div>
                                                            )}
                                                            {item.board && item.board !== '' && (
                                                                <div className="flex flex-col mt-2"><span className="text-gray-500 mb-1">Board</span><span className="italic text-gray-400 text-xs text-right">&quot;{String(item.board)}&quot;</span></div>
                                                            )}
                                                        </div>

                                                        {/* Stats & Time */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.stats && typeof item.stats === 'object' && 'numResidents' in item.stats && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Residents</span><span>{String(Number(item.stats.numResidents))}</span></div>
                                                            )}
                                                            {item.stats && typeof item.stats === 'object' && 'numTownBlocks' in item.stats && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Town Blocks</span><span>{String(Number(item.stats.numTownBlocks))} / {String(Number(item.stats.maxTownBlocks))}</span></div>
                                                            )}
                                                            {item.timestamps?.registered && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Founded</span><span>{new Date(item.timestamps.registered).toLocaleDateString()}</span></div>
                                                            )}
                                                        </div>

                                                        {/* Status Flags */}
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {item.status?.isOpen !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isOpen ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isOpen ? 'Open' : 'Closed'}</span>}
                                                            {item.status?.isPublic !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isPublic ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isPublic ? 'Public' : 'Private'}</span>}
                                                            {item.status?.isCapital !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isCapital ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isCapital ? 'Capital' : 'Not Capital'}</span>}
                                                            {item.status?.isOverClaimed !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isOverClaimed ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isOverClaimed ? 'Overclaimed' : 'Claim OK'}</span>}
                                                        </div>

                                                        {/* Permissions */}
                                                        {item.perms?.flags && (
                                                            <div className="mt-2 text-xs text-gray-400 flex flex-wrap gap-2">
                                                                <span className="bg-black/40 px-2 py-1 rounded">PvP: {item.perms.flags.pvp ? 'On' : 'Off'}</span>
                                                                <span className="bg-black/40 px-2 py-1 rounded">Mobs: {item.perms.flags.mobs ? 'On' : 'Off'}</span>
                                                                <span className="bg-black/40 px-2 py-1 rounded">Fire: {item.perms.flags.fire ? 'On' : 'Off'}</span>
                                                                <span className="bg-black/40 px-2 py-1 rounded">Explosions: {item.perms.flags.explosion ? 'On' : 'Off'}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {activeTab === 'nations' && (
                                                    <div className="space-y-3 text-sm text-gray-300 mt-2">
                                                        {/* Relationships */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.king && typeof item.king === 'object' && 'name' in item.king && (
                                                                <div className="flex justify-between"><span className="text-gray-500">King</span><span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'players', search: String((item.king as { name: string }).name) } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{String((item.king as { name: string }).name)}</span></div>
                                                            )}
                                                            {item.capital && typeof item.capital === 'object' && 'name' in item.capital && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Capital</span><span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'towns', search: String(item.capital!.name) } })); }} className="text-right ml-4 cursor-pointer hover:underline hover:text-earthmc-green transition-colors text-white">{String(item.capital!.name)}</span></div>
                                                            )}
                                                            {item.board && item.board !== '' && (
                                                                <div className="flex flex-col mt-2"><span className="text-gray-500 mb-1">Board</span><span className="italic text-gray-400 text-xs text-right">&quot;{String(item.board)}&quot;</span></div>
                                                            )}
                                                        </div>

                                                        {/* Stats & Time */}
                                                        <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] space-y-2">
                                                            {item.stats && typeof item.stats === 'object' && 'numTowns' in item.stats && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Towns</span><span>{String(Number(item.stats.numTowns))}</span></div>
                                                            )}
                                                            {item.stats && typeof item.stats === 'object' && 'numResidents' in item.stats && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Residents</span><span>{String(Number(item.stats.numResidents))}</span></div>
                                                            )}
                                                            {item.timestamps?.registered && (
                                                                <div className="flex justify-between"><span className="text-gray-500">Founded</span><span>{new Date(item.timestamps.registered).toLocaleDateString()}</span></div>
                                                            )}
                                                        </div>

                                                        {/* Status Flags */}
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {item.status?.isOpen !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isOpen ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isOpen ? 'Open' : 'Closed'}</span>}
                                                            {item.status?.isPublic !== undefined && <span className={`text-xs px-2 py-1 rounded-md border ${item.status.isPublic ? 'bg-earthmc-green/10 text-earthmc-green border-earthmc-green/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>{item.status.isPublic ? 'Public' : 'Private'}</span>}
                                                        </div>

                                                        {/* Diplomacy */}
                                                        {item.stats && (
                                                            <div className="mt-2 text-xs flex flex-wrap gap-2">
                                                                {(item.stats.numAllies !== undefined) && <span className="bg-earthmc-green/10 text-earthmc-green border border-earthmc-green/20 px-2 py-1 rounded">Allies: {Number(item.stats.numAllies)}</span>}
                                                                {(item.stats.numEnemies !== undefined) && <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 rounded">Enemies: {Number(item.stats.numEnemies)}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {totalPages > 1 ? renderPagination() : null}
        </motion.div>
    );
}
