import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          compact ? 'min-h-[40px] px-3.5 text-xs' : 'min-h-[44px] px-4 text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#24312C] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3
                    id="pwa-guide-title"
                    className="text-base font-semibold text-[#111816] dark:text-[#F3F7F5]"
                  >
                    {isIOS ? 'Install on iPhone or iPad' : 'Install on Android Phone'}
                  </h3>
                  <p className="text-xs text-[#54665F] dark:text-[#8EA39B]">
                    Runs offline as a standalone app on your home screen
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close installation guide"
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-[#54665F] hover:text-[#111816] dark:text-[#8EA39B] dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-5 space-y-3 text-sm text-[#31413B] dark:text-[#C1D1CB]">
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">1.</span>
                  <span>Open this page in Safari and tap the Share icon in the bottom toolbar.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">2.</span>
                  <span>Scroll down and select Add to Home Screen.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">3.</span>
                  <span>Tap Add to launch ChargeGuard like a native app.</span>
                </li>
              </ol>
            ) : (
              <ol className="mt-5 space-y-3 text-sm text-[#31413B] dark:text-[#C1D1CB]">
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">1.</span>
                  <span>
                    Open this app URL in <strong>Chrome on Android</strong>
                    {!isAndroid ? ' (or Chrome on desktop)' : ''}.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">2.</span>
                  <span>Tap the three-dot menu in the top right corner and choose Install app or Add to Home screen.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">3.</span>
                  <span>
                    Want a native background Android .apk instead? Open the <strong>Android APK</strong> tab for ready-to-build Kotlin code.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#111816] dark:bg-[#EEF3F1] text-white dark:text-[#111816] font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-5 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Offline mode · Battery alarm works without internet</span>
    </div>
  );
};
