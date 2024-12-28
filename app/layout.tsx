import '@/app/ui/global.css';
import { inter } from '@/app/ui/fonts';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <meta name="apple-mobile-web-app-title" content="Sabari" />
            <body className={`${inter.className} antialiased`}>{children}</body>
        </html>
    );
}
