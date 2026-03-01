import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Fetch ALL currently online players
        const onlineRes = await fetch('https://api.earthmc.net/v3/aurora/online', { cache: 'no-store' });
        const onlineData = await onlineRes.json();

        // Fetch map players with live coordinates
        const mapRes = await fetch('https://map.earthmc.net/tiles/players.json', { cache: 'no-store' });
        const mapData = await mapRes.json();

        if (!onlineRes.ok || !mapRes.ok || !onlineData.players || !mapData.players) {
            return NextResponse.json({ error: 'Failed to fetch external API data' }, { status: 500 });
        }

        const onlineSet = new Set<string>();
        const onlineNameMap = new Map<string, string>();

        // populate online set (uuid and name)
        for (const p of onlineData.players) {
            const dashUuid = p.uuid.length === 32 ? p.uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5') : p.uuid;
            onlineSet.add(dashUuid);
            onlineNameMap.set(dashUuid, p.name);
        }

        const mapUUIDs = new Set<string>();
        const resultPlayers = [];

        // process map data
        for (const mp of mapData.players) {
            if (mp.world === "minecraft_overworld") {
                const dashUuid = mp.uuid.length === 32 ? mp.uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5') : mp.uuid;
                mapUUIDs.add(dashUuid);
                resultPlayers.push({
                    player_uuid: dashUuid,
                    player_name: mp.name,
                    x: mp.x,
                    z: mp.z,
                    yaw: mp.yaw || 0,
                    world: mp.world,
                    is_online: true, // Only if also in onlineData technically, but map is usually online
                    is_visible: true
                });
            }
        }

        // find players who are online but not on map (hidden)
        const hiddenPlayers = Array.from(onlineSet).filter(uuid => !mapUUIDs.has(uuid));

        if (hiddenPlayers.length > 0) {
            // For players who are "hidden" (is_visible = false), we still want to show them on the map
            // at their last known overworld coordinates. We use a LATERAL join to find those coordinates.
            const query = `
                SELECT u.uuid AS player_uuid, loc.x, loc.z
                FROM unnest($1::text[]) AS u(uuid)
                CROSS JOIN LATERAL (
                    SELECT x, z
                    FROM player_activity
                    WHERE player_uuid = u.uuid
                      AND x IS NOT NULL
                      AND world = 'minecraft_overworld'
                    ORDER BY snapshot_ts DESC
                    LIMIT 1
                ) loc
            `;
            const dataRes = await pool.query(query, [hiddenPlayers]);

            for (const row of dataRes.rows) {
                resultPlayers.push({
                    player_uuid: row.player_uuid,
                    player_name: onlineNameMap.get(row.player_uuid) || "Unknown",
                    x: row.x,
                    z: row.z,
                    yaw: 0,
                    world: 'minecraft_overworld',
                    is_online: true,
                    is_visible: false
                });
            }
        }

        return NextResponse.json({ players: resultPlayers, total_online: onlineData.count }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
