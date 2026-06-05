"use client";

import * as React from "react";

type Controls = { stop: () => void };

// The 1D symbologies found on grocery packaging. Used for both engines.
// BarcodeDetector uses these lowercase strings; zxing maps them to its enum.
const FORMAT_NAMES = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"] as const;

// --- Native BarcodeDetector (not in the DOM lib typings yet) -----------------
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
function getBarcodeDetector(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

// focusMode isn't in the standard DOM typings yet, so extend the constraint types.
type FocusConstraintSet = MediaTrackConstraintSet & { focusMode?: string };

// Rear camera, sharp-enough resolution. `ideal` keeps graceful fallback on
// devices that can't honour the exact value.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  // Best-effort continuous autofocus. Most Android Chrome builds ignore this
  // (focusMode isn't exposed), in which case the OS default autofocus applies.
  advanced: [{ focusMode: "continuous" } as FocusConstraintSet],
};

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
    let cancelled = false;
    let stream: MediaStream | null = null;
    let zxingControls: Controls | undefined;
    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handle = (code: string) => {
      if (detectedRef.current || cancelled || !code) return;
      detectedRef.current = true;
      try {
        navigator.vibrate?.(60);
      } catch {
        /* no haptics */
      }
      onDetected(code);
    };

    (async () => {
      try {
        // 1) Acquire the rear camera ourselves so both engines share one stream.
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {
          /* autoplay may need the muted attr, which is set on the element */
        });

        const Detector = getBarcodeDetector();
        if (Detector) {
          // 2a) Native path (Android Chrome, etc.) — hardware/ML decoding, far
          // more tolerant of blur/angle/distance than the JS fallback.
          let formats = [...FORMAT_NAMES] as string[];
          try {
            const supported = (await Detector.getSupportedFormats?.()) ?? [];
            const filtered = formats.filter((f) => supported.includes(f));
            if (filtered.length) formats = filtered;
          } catch {
            /* keep the default format list */
          }
          const detector = new Detector({ formats });

          const tick = async () => {
            if (cancelled || detectedRef.current) return;
            try {
              if (video.readyState >= 2 /* HAVE_CURRENT_DATA */) {
                const codes = await detector.detect(video);
                const hit = codes.find((c) => c.rawValue);
                if (hit) {
                  handle(hit.rawValue);
                  return;
                }
              }
            } catch {
              /* transient detect error — keep looping */
            }
            if (!cancelled && !detectedRef.current) {
              // ~8 scans/sec is plenty and keeps the main thread responsive.
              timeoutId = setTimeout(() => {
                rafId = requestAnimationFrame(tick);
              }, 120);
            }
          };
          rafId = requestAnimationFrame(tick);
          return;
        }

        // 2b) Fallback path (no BarcodeDetector, e.g. iOS Safari) — zxing JS
        // decoder reading from the stream we already attached.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
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
        zxingControls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
          if (result && !detectedRef.current && !cancelled) {
            ctrl.stop();
            handle(result.getText());
          }
        });
        if (cancelled) zxingControls.stop();
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
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
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
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-3/4 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">
              Fill the box with the barcode · hold ~15–20 cm away
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
