'use client';

import { MapContainer, TileLayer, Marker, Tooltip, useMap, Polyline, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import ChatWindow from '@/components/ChatWindow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMapPoints(points: any, scale: number): any {
    if (!points) return [];
    if (Array.isArray(points)) {
        return points.map(p => parseMapPoints(p, scale));
    }
    if (points.x !== undefined && points.z !== undefined) {
        return [-points.z * scale, points.x * scale];
    }
    return [];
}

// Extract details from the EarthMC marker popup HTML string
function parseTownFromHtml(html: string) {
    if (!html) return null;

    // Extract everything within the title span and strip HTML tags
    const spanMatch = html.match(/<span style="font-size:120%;">([\s\S]*?)<\/span>/);
    let name = "Unknown Town";
    let nation = "";

    if (spanMatch) {
        const innerText = spanMatch[1].replace(/<[^>]*>?/gm, '').trim();
        const parts = innerText.match(/^(.*?)\s*\((.*?)\)$/);
        if (parts) {
            name = parts[1].trim();
            nation = parts[2].trim();
        } else {
            name = innerText;
        }
    }

    const mayorMatch = html.match(/Mayor: <b>(.*?)<\/b>/);
    const mayor = mayorMatch ? mayorMatch[1] : "Unknown";

    const pvpMatch = html.match(/PVP: <b>(.*?)<\/b>/);
    const pvp = pvpMatch ? pvpMatch[1] : "false";

    const publicMatch = html.match(/Public: <b>(.*?)<\/b>/);
    const isPublic = publicMatch ? publicMatch[1] : "false";

    const resMatch = html.match(/Residents: <b>(\d+)<\/b>/);
    const residents = resMatch ? parseInt(resMatch[1], 10) : 0;

    return { name, nation, mayor, pvp, isPublic, residents };
}

// Get center of a simple bounding box
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCenterCoords(points: any[]) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    // Attempting a simple flat check of the first linear array we find
    const flatPoints = points.flat(3);
    for (const p of flatPoints) {
        if (p && p.x !== undefined && p.z !== undefined) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        }
    }

    if (minX === Infinity) return { x: 0, z: 0 };
    return {
        x: Math.round((minX + maxX) / 2),
        z: Math.round((minZ + maxZ) / 2)
    };
}

interface PlayerData {
    player_uuid: string;
    player_name: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    world: string;
    is_online: boolean;
    is_visible: boolean;
    last_seen?: number;
}

function MapController({ coordsRef }: { coordsRef: React.RefObject<HTMLSpanElement | null> }) {
    const map = useMap();

    useEffect(() => {
        const handleFly = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.lat !== undefined && customEvent.detail.lng !== undefined) {
                map.flyTo([customEvent.detail.lat, customEvent.detail.lng], 5, { duration: 1.5 });
            }
        };
        window.addEventListener('fly-to-map', handleFly);
        return () => window.removeEventListener('fly-to-map', handleFly);
    }, [map]);

    useEffect(() => {
        const onMove = (e: L.LeafletMouseEvent) => {
            if (coordsRef.current) {
                const scale = 1 / Math.pow(2, 3);
                const x = Math.round(e.latlng.lng / scale);
                const z = Math.round(-e.latlng.lat / scale);
                coordsRef.current.innerText = `${x}, ${z}`;
            }
        };
        map.on('mousemove', onMove);
        return () => {
            map.off('mousemove', onMove);
        };
    }, [map, coordsRef]);

    return null;
}

export default function EarthMap({ activeTab }: { activeTab?: string }) {
    const [playersMap, setPlayersMap] = useState<Map<string, PlayerData>>(new Map());
    const [totalOnline, setTotalOnline] = useState<number>(0);
    const [pathData, setPathData] = useState<{ lat: number, lng: number }[][]>([]);
    const [pathPlayer, setPathPlayer] = useState<{ uuid: string, name: string } | null>(null);
    const [showPlayers, setShowPlayers] = useState<boolean>(true);
    const [showTowns, setShowTowns] = useState<boolean>(false);
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [townMarkers, setTownMarkers] = useState<any[] | null>(null);

    const coordsRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (showTowns && !townMarkers) {
            const fetchMarkers = async () => {
                try {
                    const res = await fetch('/api/map/markers');
                    const data = await res.json();

                    // We only want the towny layer
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const townyLayer = data.find((layer: any) => layer.id === 'towny');
                    if (townyLayer && townyLayer.markers) {
                        setTownMarkers(townyLayer.markers);
                    }
                } catch (err) {
                    console.error("Failed to fetch town markers", err);
                }
            };
            fetchMarkers();
        }
    }, [showTowns, townMarkers]);

    useEffect(() => {
        // Fetch live players
        const fetchPlayers = async () => {
            try {
                const res = await fetch('/api/map');
                const data = await res.json();
                if (data.players) {
                    setPlayersMap((prevMap: Map<string, PlayerData>) => {
                        const newMap = new Map(prevMap);
                        const now = Date.now();
                        const fetchedUuids = new Set<string>();

                        data.players.forEach((p: PlayerData) => {
                            fetchedUuids.add(p.player_uuid);
                            const existing = newMap.get(p.player_uuid);
                            const updatedPlayer = {
                                ...(existing || {}),
                                ...p,
                                is_online: true,
                                last_seen: existing?.last_seen || now
                            } as PlayerData;
                            newMap.set(p.player_uuid, updatedPlayer);

                            // Live update the path if this is the tracked player
                            setPathPlayer(currentPathPlayer => {
                                if (currentPathPlayer && currentPathPlayer.uuid === p.player_uuid) {
                                    setPathData(currentPathData => {
                                        if (currentPathData.length === 0) return currentPathData;
                                        const scale = 1 / Math.pow(2, 3);
                                        const newLat = -p.z * scale;
                                        const newLng = p.x * scale;

                                        const lastSegmentIdx = currentPathData.length - 1;
                                        const lastSegment = currentPathData[lastSegmentIdx];
                                        if (!lastSegment || lastSegment.length === 0) return currentPathData;

                                        const lastPoint = lastSegment[lastSegment.length - 1];

                                        const dx = (newLng - lastPoint.lng) / scale;
                                        const dz = (-newLat - (-lastPoint.lat)) / scale;
                                        const dist = Math.sqrt(dx * dx + dz * dz);

                                        const isTeleport = dist > 500;

                                        if (Math.abs(lastPoint.lat - newLat) > 0.0001 || Math.abs(lastPoint.lng - newLng) > 0.0001) {
                                            const newPathData = [...currentPathData];
                                            if (isTeleport) {
                                                newPathData.push([{ lat: newLat, lng: newLng }]);
                                            } else {
                                                newPathData[lastSegmentIdx] = [...lastSegment, { lat: newLat, lng: newLng }];
                                            }
                                            return newPathData;
                                        }
                                        return currentPathData;
                                    });
                                }
                                return currentPathPlayer;
                            });
                        });

                        newMap.forEach((p, uuid) => {
                            if (!fetchedUuids.has(uuid)) {
                                // Instead of deleting immediately, mark as offline if we want to keep them, or just delete
                                // For tracking last_seen on map we shouldn't wipe offline completely if they just went offline? 
                                // Actually, if they are not returned by the API (which returns online + hidden online), we delete.
                                newMap.delete(uuid);
                            }
                        });

                        // Broadcast new players map for the directory component
                        window.dispatchEvent(new CustomEvent('map-players-update', { detail: newMap }));

                        return newMap;
                    });
                }
            } catch (err) {
                console.error("Failed to fetch players", err);
            }
        };

        fetchPlayers();
        const interval = setInterval(fetchPlayers, 3000);

        const handleFlyMarker = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.player) {
                setPlayersMap((prev: Map<string, PlayerData>) => {
                    if (prev.has(customEvent.detail.player.player_uuid)) return prev;
                    const newMap = new Map(prev);
                    newMap.set(customEvent.detail.player.player_uuid, customEvent.detail.player);
                    return newMap;
                });
            }
        };
        window.addEventListener('fly-to-map', handleFlyMarker);

        const handleShowPath = async (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.player_uuid) {
                const { player_uuid, player_name } = customEvent.detail;
                setPathPlayer({ uuid: player_uuid, name: player_name });

                try {
                    const res = await fetch(`/api/players/${player_uuid}/path`);
                    const data = await res.json();
                    if (data.path) {
                        const scale = 1 / Math.pow(2, 3);
                        const multiPath: { lat: number, lng: number }[][] = [];
                        let currentSegment: { lat: number, lng: number }[] = [];

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        let prevPoint: any = null;

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const point of data.path) {
                            if (prevPoint) {
                                const dx = point.x - prevPoint.x;
                                const dz = point.z - prevPoint.z;
                                const dist = Math.sqrt(dx * dx + dz * dz);

                                const isTeleport = dist > 500 || (point.world && prevPoint.world && point.world !== prevPoint.world);

                                if (isTeleport) {
                                    if (currentSegment.length > 0) {
                                        multiPath.push(currentSegment);
                                    }
                                    currentSegment = [];
                                }
                            }
                            currentSegment.push({
                                lat: -point.z * scale,
                                lng: point.x * scale
                            });
                            prevPoint = point;
                        }

                        if (currentSegment.length > 0) {
                            multiPath.push(currentSegment);
                        }

                        setPathData(multiPath);

                        if (multiPath.length > 0) {
                            const lastSegment = multiPath[multiPath.length - 1];
                            const lastPoint = lastSegment[lastSegment.length - 1];
                            window.dispatchEvent(new CustomEvent('fly-to-map', {
                                detail: { lat: lastPoint.lat, lng: lastPoint.lng }
                            }));
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch player path", err);
                }
            }
        };
        window.addEventListener('show-player-path', handleShowPath);

        return () => {
            clearInterval(interval);
            window.removeEventListener('fly-to-map', handleFlyMarker);
            window.removeEventListener('show-player-path', handleShowPath);
        };
    }, []);

    // Independent polling for explicit Live Pill numbers from /api/online
    useEffect(() => {
        const fetchOnlineCount = async () => {
            try {
                const res = await fetch('/api/online');
                const data = await res.json();
                if (data.total_online) {
                    setTotalOnline(data.total_online);
                }
            } catch { }
        };
        fetchOnlineCount();
        const countInterval = setInterval(fetchOnlineCount, 3000); // Poll explicitly decoupled from map updates
        return () => clearInterval(countInterval);
    }, []);

    const players = Array.from(playersMap.values());

    return (
        <div className="absolute inset-0 z-0">
            <MapContainer
                center={[0, 0]}
                zoom={0}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%', background: '#000' }}
                crs={L.CRS.Simple}
                maxZoom={5}
                minZoom={0}
                preferCanvas={true}
            >
                <MapController coordsRef={coordsRef} />
                <TileLayer
                    url="https://map.earthmc.net/tiles/minecraft_overworld/{z}/{x}_{y}.png"
                    noWrap={true}
                    minNativeZoom={0}
                    maxNativeZoom={3}
                    tileSize={512}
                    errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" // Transparent pixel
                />

                {showTowns && townMarkers && townMarkers.map((marker, idx) => {
                    const scale = 1 / Math.pow(2, 3);
                    if (marker.type === 'polygon') {
                        const positions = parseMapPoints(marker.points, scale);
                        const townInfo = parseTownFromHtml(marker.popup);
                        const centerRaw = getCenterCoords(marker.points);

                        return (
                            <Polygon
                                key={`town-${idx}`}
                                positions={positions}
                                color={marker.color}
                                fillColor={marker.fillColor || marker.color}
                                weight={marker.weight || 2}
                                opacity={marker.opacity || 0.3}
                                fillOpacity={marker.opacity || 0.3}
                                eventHandlers={{
                                    click: () => {
                                        if (townInfo && townInfo.name !== 'Unknown Town') {
                                            window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'towns', search: townInfo.name } }));
                                        }
                                    }
                                }}
                            >
                                {townInfo && (
                                    <Tooltip direction="top" opacity={1} sticky={false} className="!bg-transparent !border-0 !shadow-none !p-0 z-[500]">
                                        <div className="liquid-glass text-white rounded-lg border border-white/10 p-3 flex flex-col items-center min-w-[160px] pointer-events-none">
                                            <span className="font-bold text-lg text-white mb-1">{townInfo.name}</span>
                                            {townInfo.nation && townInfo.nation !== '' && (
                                                <span className="text-xs text-amber-400 mb-2">{townInfo.nation}</span>
                                            )}

                                            <div className="flex gap-2 w-full justify-center mb-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${townInfo.pvp === 'true' ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-earthmc-green/20 text-earthmc-green border-earthmc-green/50'}`}>
                                                    PvP {townInfo.pvp === 'true' ? 'ON' : 'OFF'}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${townInfo.isPublic === 'true' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                                                    {townInfo.isPublic === 'true' ? 'Public' : 'Private'}
                                                </span>
                                            </div>

                                            <div className="text-xs text-gray-300 mb-1 w-full text-center">
                                                Mayor: <span className="font-medium text-white">{townInfo.mayor}</span>
                                            </div>
                                            <div className="text-xs text-gray-300 mb-3 w-full text-center">
                                                Residents: <span className="font-medium text-white">{townInfo.residents}</span>
                                            </div>

                                            <div className="flex gap-4 text-xs font-mono bg-black/30 p-2 rounded-lg text-gray-300 w-full justify-center">
                                                <div className="flex gap-1 items-center"><span className="text-gray-500">X</span>{centerRaw.x}</div>
                                                <div className="flex gap-1 items-center"><span className="text-gray-500">Z</span>{centerRaw.z}</div>
                                            </div>
                                        </div>
                                    </Tooltip>
                                )}
                            </Polygon>
                        );
                    }
                    /* optionally handle icon if needed, maybe not strictly necessary for polygons */
                    return null;
                })}

                {showPlayers && players.map((p) => {
                    // Leaflet CRS.Simple uses [lat, lng].
                    // We will use standard projected coords: [ -z , x ] mapped according to squaremap behavior
                    const scale = 1 / Math.pow(2, 3); // Max native zoom parameter from squaremap settings
                    const lat = -p.z * scale;
                    const lng = p.x * scale;

                    const pHeadIcon = new L.DivIcon({
                        html: `
                            <div class="relative w-8 h-8 shrink-0 shadow-lg">
                                <img 
                                    src="https://mc-heads.net/avatar/${p.player_uuid}/32"
                                    alt="${p.player_name}"
                                    class="w-full h-full object-cover bg-black/50 aspect-square rounded-md border-2 ${p.is_visible ? 'border-earthmc-green' : 'border-orange-500 grayscale'}"
                                />
                            </div>
                        `,
                        className: 'bg-transparent',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        tooltipAnchor: [0, -16]
                    });

                    return (
                        <Marker
                            key={p.player_uuid}
                            position={[lat, lng]}
                            icon={pHeadIcon}
                            eventHandlers={{
                                click: () => {
                                    window.dispatchEvent(new CustomEvent('open-directory', { detail: { tab: 'players', search: p.player_name } }));
                                }
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -16]} opacity={1} className="!bg-transparent !border-0 !shadow-none !p-0">
                                <div className="liquid-glass text-white rounded-lg border border-white/10 p-3 flex flex-col items-center min-w-[140px]">
                                    <span className="font-bold text-lg text-white mb-2">{p.player_name}</span>
                                    <span className={`text-xs px-2 py-1 rounded-full border mb-3 ${p.is_visible ? 'bg-earthmc-green/20 text-earthmc-green border-earthmc-green/50' : 'bg-orange-500/20 text-orange-400 border-orange-500/50'}`}>
                                        {p.is_visible ? 'Online' : 'Last Seen'}
                                    </span>
                                    {!p.is_visible && p.last_seen && (
                                        <div className="text-xs text-gray-400 mb-3 text-center">
                                            {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date(p.last_seen))}
                                        </div>
                                    )}
                                    <div className="flex gap-4 text-xs font-mono bg-black/30 p-2 rounded-lg text-gray-300">
                                        <div className="flex flex-col"><span className="text-gray-500">X</span>{Math.round(p.x)}</div>
                                        <div className="flex flex-col"><span className="text-gray-500">Z</span>{Math.round(p.z)}</div>
                                    </div>
                                </div>
                            </Tooltip>
                        </Marker>
                    );
                })}

                {pathData.length > 0 && (
                    <Polyline
                        positions={pathData}
                        color="#ef4444"
                        weight={4}
                        opacity={0.8}
                        dashArray="10, 10"
                        lineCap="round"
                        lineJoin="round"
                        smoothFactor={1}
                        noClip={true}
                    />
                )}
            </MapContainer>

            {pathPlayer && (!activeTab || activeTab === 'app') && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] liquid-glass flex items-center space-x-3 text-white pl-4 pr-1 py-1 rounded-full shadow-xl pointer-events-auto cursor-default whitespace-nowrap">
                    <span className="font-medium text-sm">Showing <span className="text-earthmc-green font-bold">{pathPlayer.name}</span>&apos;s path</span>
                    <button
                        onClick={() => {
                            setPathPlayer(null);
                            setPathData([]);
                        }}
                        className="w-8 h-8 rounded-full overflow-hidden hover:opacity-80 transition-opacity border-2 border-transparent shrink-0 bg-transparent flex items-center justify-center relative group"
                        title="Close Path"
                    >
                        <Image src={`https://mc-heads.net/avatar/${pathPlayer.uuid}/32`} unoptimized width={32} height={32} alt="Close" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </div>
                    </button>
                </div>
            )}

            {(!activeTab || activeTab === 'app') && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] liquid-glass text-white pl-5 pr-1.5 py-1.5 rounded-full shadow-xl pointer-events-auto flex items-center space-x-3 bg-black/20 border border-white/10">
                    <div className="flex items-center space-x-3 text-sm font-medium cursor-default">
                        <span
                            className={`font-mono whitespace-nowrap min-w-[90px] text-center cursor-pointer hover:opacity-80 transition-opacity ${showTowns ? 'text-earthmc-green font-bold' : 'text-gray-400'}`}
                            ref={coordsRef}
                            onClick={() => setShowTowns(!showTowns)}
                            title="Toggle Towns Overlay"
                        >
                            0, 0
                        </span>
                        <div className="w-px h-4 bg-white/20 shrink-0"></div>
                        <span
                            className={`font-bold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${showPlayers ? 'text-earthmc-green' : 'text-gray-500'}`}
                            onClick={() => setShowPlayers(!showPlayers)}
                            title="Toggle Players"
                        >
                            {totalOnline} <span className="font-normal text-gray-300">Online</span>
                        </span>
                        <div className="w-px h-4 bg-white/20 shrink-0"></div>
                    </div>
                    <button
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className={`px-3 py-1.5 rounded-full transition-colors flex items-center justify-center space-x-1.5 group shrink-0 ${isChatOpen ? 'bg-earthmc-green/80 hover:bg-earthmc-green' : 'bg-white/10 hover:bg-white/20'}`}
                        title="EarthMC Agent"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white group-hover:scale-110 transition-transform"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span className="font-medium text-sm">Agent</span>
                    </button>
                </div>
            )
            }

            <ChatWindow isOpen={isChatOpen && (!activeTab || activeTab === 'app')} onClose={() => setIsChatOpen(false)} />
        </div >
    );
}
