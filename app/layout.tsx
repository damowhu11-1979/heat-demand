import { AppStateProvider } from './context/AppStateContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppStateProvider>
          {children}
        </AppStateProvider>
      </body>
    </html>
  );
}
