'use client';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import TopNavigation from '@/components/TopNavigation';
import DirectoryDropdown from '@/components/DirectoryDropdown';
import { AnimatePresence } from 'framer-motion';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState('app'); // 'app', 'towns', 'nations', 'players'
  const [initialSearch, setInitialSearch] = useState('');

  useEffect(() => {
    const handleOpenDirectory = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.tab) {
        setActiveTab(customEvent.detail.tab);
      }
      if (customEvent.detail && customEvent.detail.search !== undefined) {
        setInitialSearch(customEvent.detail.search);
      } else {
        setInitialSearch('');
      }
    };
    window.addEventListener('open-directory', handleOpenDirectory);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTab('app');
        setInitialSearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('open-directory', handleOpenDirectory);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Map Background */}
      <Map activeTab={activeTab} />

      {/* Floating UI Layer */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[1000] flex flex-col items-center">

        {/* Top Navigation */}
        <div className="mt-6 pointer-events-auto">
          <TopNavigation activeTab={activeTab} setActiveTab={(tab) => {
            setActiveTab(tab);
            setInitialSearch('');
          }} />
        </div>

        {/* Directory Dropdowns */}
        <div className="mt-8 pointer-events-auto w-full max-w-4xl px-4 flex justify-center">
          <AnimatePresence>
            {activeTab !== 'app' && (
              <DirectoryDropdown activeTab={activeTab} initialSearch={initialSearch} />
            )}
          </AnimatePresence>
        </div>

      </div>
    </main>
  );
}
