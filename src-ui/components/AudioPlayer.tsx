import React, { useState } from "react";
import { Play, Pause } from "lucide-react";
import { Waveform } from "./Waveform";

export interface AudioPlayerProps {
  durationFormatted?: string;
  waveform?: number[];
  className?: string;
}

const defaultWaveform = [
  12, 18, 25, 14, 30, 20, 32, 18, 28, 38, 22, 16, 30, 24, 39, 20, 29, 15, 34, 23,
  27, 36, 18, 31, 24, 20, 40, 27, 33, 16, 30, 22, 36, 20, 28, 14, 32, 23, 19, 27,
  14, 22, 33, 19, 28, 35, 18, 26, 30, 16, 24, 32, 20, 15, 29, 21, 35, 18, 26, 13
];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  durationFormatted = "42:03",
  waveform = defaultWaveform,
  className = "",
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [speed, setSpeed] = useState<"1x" | "1.25x" | "1.5x" | "2x">("1x");

  const speeds: ("1x" | "1.25x" | "1.5x" | "2x")[] = ["1x", "1.25x", "1.5x", "2x"];

  const toggleSpeed = () => {
    const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
    setSpeed(speeds[nextIdx]);
  };

  return (
    <div
      className={`p-3 bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-subtle ${className}`}
    >
      <div className="mb-2">
        <Waveform
          data={waveform}
          progress={playbackProgress}
          height={32}
          onSeek={(p) => setPlaybackProgress(p)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-primary hover:bg-brand-primary-hover active:bg-[#3C563F] text-white transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
          <span className="text-xs font-medium text-brand-text-secondary dark:text-dark-text-secondary tabular-nums">
            00:00 / {durationFormatted}
          </span>
        </div>

        <button
          onClick={toggleSpeed}
          className="px-2 py-0.5 text-xs font-semibold rounded bg-black/5 dark:bg-white/5 text-brand-text dark:text-dark-text hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          {speed}
        </button>
      </div>
    </div>
  );
};
