// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'Next.js App',
  description: 'Created with create-next-app',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
