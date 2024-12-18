import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ message: "Hello World" });
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const text = url.searchParams.get('text');

        if (!text) {
            return NextResponse.json(
                { error: 'Text parameter is required' },
                { status: 400 }
            );
        }
        
        const backendResponse = await fetch(`${process.env.BACKEND_API}/drafts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        // Ensure the response is readable as a stream
        if (!backendResponse.body) {
            throw new Error('No response body received from backend');
        }

        // Return the stream directly to the client
        return new Response(backendResponse.body, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Error processing draft:', error);
        return NextResponse.json(
            { error: 'Failed to process draft' },
            { status: 500 }
        );
    }
}
