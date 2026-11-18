import React, { useEffect, useRef } from "react";

export interface WaveformProps {
  data: number[];
  progress?: number; // 0 to 1
  height?: number;
  className?: string;
  onSeek?: (progress: number) => void;
}

export const Waveform: React.FC<WaveformProps> = ({
  data,
  progress = 0,
  height = 36,
  className = "",
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const values = data.length > 0 ? data : [10, 15, 25, 12, 18, 22, 14, 28, 19, 30, 16, 24];
    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(width / (barWidth + gap));
    const step = values.length / totalBars;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const primaryColor = "#577A5B";
    const baseColor = isDark ? "#2C362F" : "#E2DDD2";

    for (let i = 0; i < totalBars; i++) {
      const idx = Math.floor(i * step);
      const val = values[idx] || 10;
      const barHeight = Math.max(3, (val / 100) * (height - 4));
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      const barProgress = i / totalBars;
      ctx.fillStyle = barProgress <= progress ? primaryColor : baseColor;

      // Draw rounded rectangle bar
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }, [data, progress, height]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(newProgress);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{ height: `${height}px` }}
      className={`w-full block ${onSeek ? "cursor-pointer" : ""} ${className}`}
    />
  );
};
