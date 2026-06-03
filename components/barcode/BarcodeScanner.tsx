"use client";

import * as React from "react";

type Controls = { stop: () => void };

export function BarcodeScanner({
  active,
  onDetected,
}: {
  active: boolean;
  onDetected: (code: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const detectedRef = React.useRef(false);

  React.useEffect(() => {
    if (!active) return;
    detectedRef.current = false;
    let controls: Controls | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result, _err, ctrl) => {
            if (result && !detectedRef.current && !cancelled) {
              detectedRef.current = true;
              ctrl.stop();
              onDetected(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Camera unavailable — enter the barcode below.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [active, onDetected]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative aspect-[4/3] w-full">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-3/4 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/80">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
