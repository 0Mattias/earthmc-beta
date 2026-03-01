import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const emcRes = await fetch('https://api.earthmc.net/v3/aurora/online', { cache: 'no-store' });
        if (emcRes.ok) {
            const emcData = await emcRes.json();
            if (emcData && typeof emcData.count === 'number') {
                return NextResponse.json({ total_online: emcData.count }, { status: 200 });
            }
        }
    } catch (e) {
        console.error('API fetch error for total players:', e);
    }
    return NextResponse.json({ total_online: 0 }, { status: 500 });
}
