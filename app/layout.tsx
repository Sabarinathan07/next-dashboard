// layout.tsx
import React from 'react';

export const metadata = {
    title: 'Your Page Title',
    description: 'Your Page Description',
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
