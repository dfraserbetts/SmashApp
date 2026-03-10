'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type InfoTooltipProps = {
  label: string;
  tooltip: string;
  className?: string;
};

export function InfoTooltip({
  label,
  tooltip,
  className,
}: InfoTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({
    left: -9999,
    top: -9999,
    maxWidth: 320,
  });

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltipEl = tooltipRef.current;
    if (!trigger || !tooltipEl) return;

    const viewportPadding = 12;
    const tooltipGap = 6;
    const maxWidth = Math.max(
      180,
      Math.min(320, window.innerWidth - viewportPadding * 2),
    );
    tooltipEl.style.maxWidth = `${maxWidth}px`;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(
      viewportPadding,
      Math.min(
        left,
        window.innerWidth - viewportPadding - tooltipRect.width,
      ),
    );

    let top = triggerRect.top - tooltipRect.height - tooltipGap;
    if (top < viewportPadding) {
      top = Math.min(
        window.innerHeight - viewportPadding - tooltipRect.height,
        triggerRect.bottom + tooltipGap,
      );
    }

    setTooltipPos({ left, top, maxWidth });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateTooltipPosition();
    const onViewportChange = () => updateTooltipPosition();

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isOpen, updateTooltipPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return;
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={[
          'inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] font-semibold text-zinc-300 outline-none transition hover:border-zinc-400 hover:text-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-500',
          className ?? '',
        ].join(' ')}
      >
        i
      </button>
      <span
        id={tooltipId}
        ref={tooltipRef}
        role="tooltip"
        aria-hidden={!isOpen}
        className={[
          'pointer-events-none fixed z-30 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-xs leading-snug text-zinc-200 whitespace-normal break-words shadow-lg transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{
          left: `${tooltipPos.left}px`,
          top: `${tooltipPos.top}px`,
          maxWidth: `${tooltipPos.maxWidth}px`,
        }}
      >
        {tooltip}
      </span>
    </span>
  );
}

type TooltipLabelProps = {
  label: string;
  tooltip: string;
  className?: string;
  textClassName?: string;
};

export function TooltipLabel({
  label,
  tooltip,
  className,
  textClassName,
}: TooltipLabelProps) {
  return (
    <span className={['inline-flex items-center gap-1.5', className ?? ''].join(' ')}>
      <span className={textClassName}>{label}</span>
      <InfoTooltip label={`${label} information`} tooltip={tooltip} />
    </span>
  );
}
