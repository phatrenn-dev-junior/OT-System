import { useEffect, useState } from 'react';
import OtForm from './components/OtForm.jsx';

export default function App() {
  const [webApp, setWebApp] = useState(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();
    setWebApp(tg);
  }, []);

  // Not opened from Telegram (or the SDK failed to load)
  if (!webApp || !webApp.initData) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl bg-tg-bg p-6 text-center shadow-sm">
          <h1 className="mb-2 text-lg font-semibold">Open inside Telegram</h1>
          <p className="text-sm text-tg-hint">
            This page is a Telegram Mini App. Please open it from the bot's menu button.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Assign Overtime</h1>
        <p className="text-sm text-tg-hint">
          The employee will be notified and asked to acknowledge.
        </p>
      </header>
      <OtForm webApp={webApp} />
    </main>
  );
}