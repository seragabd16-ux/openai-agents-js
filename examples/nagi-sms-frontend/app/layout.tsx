import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '../components/sidebar';
import { Header } from '../components/header';
import { Toaster } from 'sonner';
import 'sonner/dist/sonner.css';

export const metadata: Metadata = {
  title: 'NAGI-SMS Dashboard',
  description: 'SMS campaign management dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background">
        <div className="min-h-screen flex flex-col">
          <Header />
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 p-6 bg-background">{children}</main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
