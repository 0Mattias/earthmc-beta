import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '21', 10);
        const search = searchParams.get('search') || '';
        const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';
        const sortBy = searchParams.get('sortBy') || 'name';

        const offset = (page - 1) * limit;

        // Base query conditions
        let whereClause = `ps.snapshot_ts = (
            SELECT COALESCE(
                (SELECT MAX(snapshot_ts) FROM player_snapshots WHERE snapshot_ts < (SELECT MAX(snapshot_ts) FROM player_snapshots)),
                (SELECT MAX(snapshot_ts) FROM player_snapshots)
            )
        )`;
        const queryParams: (string | number)[] = [];
        let paramIndex = 1;

        if (search) {
            whereClause += ` AND ps.data->>'name' ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) 
            FROM player_snapshots ps
            WHERE ${whereClause}
        `;
        const countRes = await pool.query(countQuery, queryParams);
        let totalCount = parseInt(countRes.rows[0].count, 10);

        // Determine ORDER BY clause
        let orderByStr = `LOWER(ps.data->>'name') ${sortOrder}`;
        if (sortBy === 'balance') {
            orderByStr = `(ps.data->'stats'->>'balance')::numeric ${sortOrder} NULLS LAST, LOWER(ps.data->>'name') ASC`;
        } else if (sortBy === 'online') {
            orderByStr = `COALESCE(ap.is_online, FALSE) DESC, (ps.data->'timestamps'->>'lastOnline')::numeric DESC NULLS LAST, LOWER(ps.data->>'name') ASC`;
        }

        // Get paginated data, join with player_activity to get latest coordinates
        queryParams.push(limit, offset);
        const dataQuery = `
            WITH latest_pa_ts AS (
                SELECT MAX(snapshot_ts) as max_ts FROM player_activity
            ),
            active_players AS (
                SELECT player_uuid, is_visible, is_online
                FROM player_activity
                WHERE snapshot_ts = (SELECT max_ts FROM latest_pa_ts)
            ),
            paginated_players AS (
                SELECT ps.data, ap.is_visible, ap.is_online
                FROM player_snapshots ps
                LEFT JOIN active_players ap ON ps.data->>'uuid' = ap.player_uuid
                WHERE ${whereClause}
                ORDER BY ${orderByStr}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            )
            SELECT pp.data, pp.is_visible, pp.is_online, last_coords.x, last_coords.z 
            FROM paginated_players pp
            LEFT JOIN LATERAL (
                SELECT x, z
                FROM player_activity
                WHERE player_uuid = pp.data->>'uuid'
                  AND x IS NOT NULL
                ORDER BY snapshot_ts DESC
                LIMIT 1
            ) last_coords ON true
        `;
        const dataRes = await pool.query(dataQuery, queryParams);

        const mergedData: Record<string, unknown>[] = dataRes.rows.map((r: { data: string | Record<string, unknown>, is_visible: boolean | null, is_online: boolean | null, x: number | null, z: number | null }) => {
            const parsed = (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>;

            if (parsed.status && typeof parsed.status === 'object') {
                const status = parsed.status as Record<string, unknown>;
                // If they are not found in the latest player_activity snapshot (r.is_online is null), they are entirely offline.
                status.isOnline = r.is_online !== null ? r.is_online : false;
                status.isHidden = r.is_visible === false || r.is_visible === null;
            }

            return {
                ...parsed,
                location: r.x != null && r.z != null ? { x: Math.round(r.x), z: Math.round(r.z) } : null
            };
        });

        if (search) {
            const fallbackQuery = `
                WITH latest_ts AS (SELECT MAX(snapshot_ts) as max_ts FROM player_activity)
                SELECT DISTINCT ON (pa.player_name) pa.player_uuid, pa.player_name, pa.x, pa.z, pa.is_visible,
                       (pa.snapshot_ts = lt.max_ts) as is_online_now
                FROM player_activity pa
                CROSS JOIN latest_ts lt
                WHERE pa.player_name ILIKE $1
                ORDER BY pa.player_name, pa.snapshot_ts DESC
                LIMIT 10
            `;
            const fallbackRes = await pool.query(fallbackQuery, [`%${search}%`]);
            for (const row of fallbackRes.rows) {
                if (!mergedData.find((r) => {
                    const rName = typeof r.name === 'object' && r.name !== null ? (r.name as Record<string, unknown>).name : r.name;
                    return typeof rName === 'string' && rName.toLowerCase() === row.player_name.toLowerCase();
                })) {
                    mergedData.push({
                        name: row.player_name,
                        uuid: row.player_uuid,
                        status: {
                            isOnline: row.is_online_now,
                            isHidden: row.is_visible === false || row.is_visible === null,
                            isNPC: false
                        },
                        stats: { balance: 0 },
                        location: row.x != null && row.z != null ? { x: Math.round(row.x), z: Math.round(row.z) } : null
                    });
                }
            }
            totalCount = Math.max(totalCount, mergedData.length);
        }

        return NextResponse.json({
            data: mergedData,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        }, { status: 200 });
    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
