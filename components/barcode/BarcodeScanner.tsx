"use client";

import * as React from "react";

type Controls = { stop: () => void };

// focusMode isn't in the standard DOM typings yet, so extend the constraint types.
type FocusConstraintSet = MediaTrackConstraintSet & { focusMode?: string };
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };

async function enableContinuousAutofocus(stream: MediaStream | null | undefined) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return;
  try {
    const caps = (track.getCapabilities?.() ?? {}) as FocusCapabilities;
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
      await track.applyConstraints({
        advanced: [{ focusMode: "continuous" } as FocusConstraintSet],
      });
    }
  } catch {
    /* focus control unsupported on this device — ignore */
  }
}

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

        // Restrict to the 1D formats found on food packaging — faster, fewer misreads.
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
          delayBetweenScanAttempts: 100,
        });

        // Rear camera (never the front one). The usual failure is the lens not
        // focusing on a close barcode, so ask for continuous autofocus and a
        // sharp-enough resolution. `ideal` keeps graceful fallback.
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" } as FocusConstraintSet],
          },
        };

        controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current ?? undefined,
          (result, _err, ctrl) => {
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
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        // Re-apply continuous autofocus on the running track (some browsers
        // ignore `advanced` focus hints in the initial getUserMedia call).
        await enableContinuousAutofocus(videoRef.current?.srcObject as MediaStream | null);
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

  // Tapping nudges autofocus again, in case it drifted on a close-up barcode.
  function refocus() {
    void enableContinuousAutofocus(videoRef.current?.srcObject as MediaStream | null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative aspect-[4/3] w-full" onClick={refocus}>
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        {!error && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-3/4 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">
              Hold ~10–15 cm away · tap to refocus
            </div>
          </>
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
