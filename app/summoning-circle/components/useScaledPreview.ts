"use client";

import { useLayoutEffect, useRef, useState } from "react";

type UseScaledPreviewOptions = {
  enabled?: boolean;
  contentKey?: string | number;
};

export function useScaledPreview(options: UseScaledPreviewOptions = {}) {
  const { enabled = true, contentKey } = options;
  const isEnabled = Boolean(enabled);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isEnabled) {
      setScale((prev) => (prev === 1 ? prev : 1));
      setScaledHeight((prev) => (prev === null ? prev : null));
      return;
    }

    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    let rafId: number | null = null;
    const measure = () => {
      const wrapWidth = wrap.getBoundingClientRect().width || 0;
      if (wrapWidth <= 0) {
        setScale(1);
        setScaledHeight(null);
        return;
      }

      const prevTransform = inner.style.transform;
      inner.style.transform = "none";
      const innerWidth = inner.scrollWidth || inner.getBoundingClientRect().width || 0;
      const innerHeight = inner.scrollHeight || inner.getBoundingClientRect().height || 0;
      inner.style.transform = prevTransform;

      if (innerWidth <= 0) {
        setScale(1);
        setScaledHeight(null);
        return;
      }

      const nextScale = Math.min(1, wrapWidth / innerWidth);
      setScale(nextScale);
      setScaledHeight(Math.ceil(innerHeight * nextScale));
    };
    const apply = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    apply();

    const ro = new ResizeObserver(() => apply());
    ro.observe(wrap);
    ro.observe(inner);

    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [contentKey, isEnabled]);

  return {
    wrapRef,
    innerRef,
    scale,
    scaledHeight,
  };
}
