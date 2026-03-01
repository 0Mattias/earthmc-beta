import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const res = await fetch('https://map.earthmc.net/tiles/minecraft_overworld/markers.json', {
            next: { revalidate: 300 } // cache for 5 minutes
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch from earthmc.net: ${res.statusText}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching markers:', error);
        return NextResponse.json({ error: 'Failed to fetch markers' }, { status: 500 });
    }
}
