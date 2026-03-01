import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uuid: string }> }
) {
    try {
        const { uuid } = await params;

        // Query player_activity for the past 24 hours
        // Order by snapshot_ts ASC to get the path in chronological order
        const query = `
            SELECT x, z, snapshot_ts
            FROM player_activity
            WHERE player_uuid = $1
              AND snapshot_ts >= NOW() - INTERVAL '24 hours'
              AND x IS NOT NULL
              AND z IS NOT NULL
            ORDER BY snapshot_ts ASC
        `;

        const res = await pool.query(query, [uuid]);

        return NextResponse.json({
            path: res.rows
        }, { status: 200 });

    } catch (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
