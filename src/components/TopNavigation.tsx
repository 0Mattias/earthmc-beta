'use client';
import {
    MapIcon,
    Castle,
    Flag,
    Users
} from 'lucide-react';
import { motion } from 'framer-motion';

type Tab = 'app' | 'towns' | 'nations' | 'players';

export default function TopNavigation({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: Tab) => void }) {
    const tabs = [
        { id: 'app', label: 'Map', icon: <MapIcon size={18} /> },
        { id: 'towns', label: 'Towns', icon: <Castle size={18} /> },
        { id: 'nations', label: 'Nations', icon: <Flag size={18} /> },
        { id: 'players', label: 'Players', icon: <Users size={18} /> },
    ];

    return (
        <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between shadow-2xl space-x-8">
            {/* Logo */}
            <div
                className="font-extrabold text-2xl tracking-tighter text-white mr-8 cursor-pointer select-none hover:opacity-80 transition-opacity"
                onClick={() => setActiveTab('app')}
            >
                EMC <span className="text-earthmc-green font-normal">Tracker</span>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`relative px-3 md:px-5 py-2 rounded-full flex items-center justify-center space-x-0 md:space-x-2 transition-all duration-300 overflow-hidden font-medium ${isActive ? 'text-earthmc-green bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <span className="relative z-10 flex items-center justify-center">{tab.icon}</span>
                            <span className="relative z-10 hidden md:inline">{tab.label}</span>

                            {isActive && (
                                <motion.div
                                    layoutId="activeTabIndicator"
                                    className="absolute inset-0 bg-white/10 rounded-full border border-earthmc-green/30"
                                    initial={false}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
