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
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");

        // Only the 1D formats found on food packaging — faster, fewer misreads.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
        });

        const onResult = (
          result: { getText: () => string } | undefined,
          _err: unknown,
          ctrl: Controls,
        ) => {
          if (result && !detectedRef.current && !cancelled) {
            detectedRef.current = true;
            ctrl.stop();
            try {
              navigator.vibrate?.(60);
            } catch {
              /* no haptics */
            }
            onDetected(result.getText());
          }
        };

        // Prefer the rear camera. `ideal` won't fail on devices without one.
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current ?? undefined,
          onResult,
        );

        if (cancelled) controls.stop();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /permission|denied|notallowed/i.test(msg)
            ? "Camera permission denied — enter the barcode below."
            : "Camera unavailable — enter the barcode below.",
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
          autoPlay
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
