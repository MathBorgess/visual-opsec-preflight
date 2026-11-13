import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Visual OpSec · Uma foto, muitas pistas',
  description: 'Curadoria educativa de exposição virtual a partir de uma única foto.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
