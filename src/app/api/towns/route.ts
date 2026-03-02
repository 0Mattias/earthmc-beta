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
        let whereClause = `snapshot_ts = (
            SELECT COALESCE(
                (SELECT MAX(snapshot_ts) FROM town_snapshots WHERE snapshot_ts < (SELECT MAX(snapshot_ts) FROM town_snapshots)),
                (SELECT MAX(snapshot_ts) FROM town_snapshots)
            )
        )`;
        const queryParams: (string | number)[] = [];
        let paramIndex = 1;

        if (search) {
            whereClause += ` AND town_name ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) 
            FROM town_snapshots 
            WHERE ${whereClause}
        `;
        const countRes = await pool.query(countQuery, queryParams);
        const totalCount = parseInt(countRes.rows[0].count, 10);

        let orderByStr = `LOWER(town_name) ${sortOrder}`;
        if (sortBy === 'balance') {
            orderByStr = `(data->'stats'->>'balance')::numeric ${sortOrder} NULLS LAST, LOWER(town_name) ASC`;
        } else if (sortBy === 'residents') {
            orderByStr = `(data->'stats'->>'numResidents')::numeric ${sortOrder} NULLS LAST, LOWER(town_name) ASC`;
        }

        // Get paginated data
        queryParams.push(limit, offset);
        const dataQuery = `
            SELECT data 
            FROM town_snapshots 
            WHERE ${whereClause}
            ORDER BY ${orderByStr}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const dataRes = await pool.query(dataQuery, queryParams);

        return NextResponse.json({
            data: dataRes.rows.map((r: { data: unknown }) => r.data),
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
