import React, { useState } from 'react';
import { Check, Copy, Download, Smartphone } from 'lucide-react';
import { ANDROID_KOTLIN_FILES } from '../data/androidKotlinTemplates';

interface AndroidCodePanelProps {
  targetPercent: number;
}

export const AndroidCodePanel: React.FC<AndroidCodePanelProps> = ({ targetPercent }) => {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_KOTLIN_FILES[0].id);
  const [copied, setCopied] = useState(false);

  const activeFile =
    ANDROID_KOTLIN_FILES.find((f) => f.id === selectedId) ?? ANDROID_KOTLIN_FILES[0];
  const code = activeFile.getContent(targetPercent);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be restricted in some frames
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#111816] dark:text-[#F3F7F5]">
          Native Android Studio Code
        </h2>
        <p className="mt-1 text-sm text-[#4F615A] dark:text-[#96ABA3]">
          You can install ChargeGuard directly to your Android home screen as a PWA right now, or compile these Kotlin files in Android Studio for a standalone native .apk with locked-screen background monitoring.
        </p>
      </div>

      {/* Android Studio Quick Steps */}
      <div className="rounded-2xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#222F2A] p-5">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-[#111816] dark:text-[#F3F7F5]">
          <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>How to build the native APK</span>
        </div>
        <ol className="mt-3 space-y-2 text-sm text-[#42534D] dark:text-[#9CB0A8]">
          <li className="flex gap-2.5">
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">1.</span>
            <span>Create a new Empty Compose Activity project in Android Studio with package <code className="font-mono text-xs text-[#111816] dark:text-[#EEF3F1]">com.chargeguard.app</code>.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">2.</span>
            <span>Paste or download the three files below (pre-configured for your <strong className="font-mono tabular-nums text-[#111816] dark:text-[#EEF3F1]">{targetPercent}%</strong> alarm target).</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">3.</span>
            <span>Run on your Android device via USB or build via <strong>Build → Generate Signed APK</strong>.</span>
          </li>
        </ol>
      </div>

      {/* File Selector + Code Viewer */}
      <div className="rounded-2xl bg-white dark:bg-[#131A18] border border-[#DCE4E0] dark:border-[#222F2A] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#E7EEEC] dark:border-[#1E2A25]">
          <div className="flex items-center gap-1 overflow-x-auto">
            {ANDROID_KOTLIN_FILES.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedId(file.id)}
                className={`min-h-[40px] px-3 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedId === file.id
                    ? 'bg-[#111816] text-white dark:bg-[#EEF3F1] dark:text-[#111816]'
                    : 'text-[#54665F] dark:text-[#93A8A0] hover:bg-[#EEF3F1] dark:hover:bg-[#1B2522]'
                }`}
              >
                {file.filename}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[40px] px-3 rounded-lg border border-[#D4DDD9] dark:border-[#283631] text-xs font-medium text-[#111816] dark:text-[#EEF3F1] hover:bg-[#F1F5F3] dark:hover:bg-[#1B2522] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copy
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Download
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#F8FAF9] dark:bg-[#0F1513] border-b border-[#E7EEEC] dark:border-[#1E2A25] text-xs text-[#54665F] dark:text-[#93A8A0] flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono truncate">{activeFile.path}</span>
          <span>{activeFile.summary}</span>
        </div>

        <pre className="p-4 overflow-x-auto max-h-[420px] text-xs leading-relaxed font-mono text-[#1E2A25] dark:text-[#D1DDD8] bg-[#FAFDFC] dark:bg-[#0C1110]">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
