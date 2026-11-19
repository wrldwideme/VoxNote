import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, AlertCircle, Volume2, VolumeX } from "lucide-react";
import { Waveform } from "./Waveform";

export interface AudioPlayerProps {
  audioPath?: string;
  durationFormatted?: string;
  waveform?: number[];
  className?: string;
  seekTime?: number | null;
  onTimeUpdate?: (currentSeconds: number) => void;
}

const defaultWaveform = [
  12, 18, 25, 14, 30, 20, 32, 18, 28, 38, 22, 16, 30, 24, 39, 20, 29, 15, 34, 23,
  27, 36, 18, 31, 24, 20, 40, 27, 33, 16, 30, 22, 36, 20, 28, 14, 32, 23, 19, 27,
  14, 22, 33, 19, 28, 35, 18, 26, 30, 16, 24, 32, 20, 15, 29, 21, 35, 18, 26, 13,
];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioPath,
  durationFormatted = "00:00",
  waveform = defaultWaveform,
  className = "",
  seekTime,
  onTimeUpdate,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [speed, setSpeed] = useState<"1x" | "1.25x" | "1.5x" | "2x">("1x");
  const [audioSrc, setAudioSrc] = useState<string>("");
  const [loadError, setLoadError] = useState(false);
  const [volume, setVolume] = useState(1);
  const lastAudibleVolumeRef = useRef(1);

  // Convert Windows filesystem path to Tauri Asset URL
  useEffect(() => {
    if (!audioPath) {
      setAudioSrc("");
      setLoadError(false);
      return;
    }

    setLoadError(false);
    try {
      // Check if Tauri is present
      if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
        import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
          setAudioSrc(convertFileSrc(audioPath));
        });
      } else {
        setAudioSrc(audioPath);
      }
    } catch {
      setAudioSrc(audioPath);
    }
  }, [audioPath]);

  // Handle external seek requests (e.g. user clicked a segment in the timeline)
  useEffect(() => {
    if (seekTime != null && audioRef.current && isFinite(seekTime)) {
      audioRef.current.currentTime = seekTime;
      audioRef.current.play().catch(() => {});
    }
  }, [seekTime]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.warn("[AudioPlayer] Playback failed:", err);
        setLoadError(true);
      });
    }
  };

  const speeds: ("1x" | "1.25x" | "1.5x" | "2x")[] = ["1x", "1.25x", "1.5x", "2x"];
  const toggleSpeed = () => {
    const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = parseFloat(newSpeed);
    }
  };

  const handleSeek = (progressRatio: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetTime = progressRatio * (audio.duration || totalDuration || 1);
    audio.currentTime = targetTime;
    setPlaybackProgress(progressRatio);
    setCurrentSeconds(targetTime);
  };

  const setPlayerVolume = (nextVolume: number) => {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    setVolume(normalized);
    if (normalized > 0) lastAudibleVolumeRef.current = normalized;
    if (audioRef.current) audioRef.current.volume = normalized;
  };

  const toggleMute = () => {
    setPlayerVolume(volume > 0 ? 0 : lastAudibleVolumeRef.current);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`p-3 bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-subtle ${className}`}
    >
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setPlaybackProgress(0);
            setCurrentSeconds(0);
          }}
          onLoadedMetadata={(e) => {
            setTotalDuration(e.currentTarget.duration);
            setLoadError(false);
          }}
          onError={() => {
            setLoadError(true);
            setIsPlaying(false);
          }}
          onTimeUpdate={(e) => {
            const cur = e.currentTarget.currentTime;
            const dur = e.currentTarget.duration || totalDuration || 1;
            setCurrentSeconds(cur);
            setPlaybackProgress(dur > 0 ? cur / dur : 0);
            onTimeUpdate?.(cur);
          }}
        />
      )}

      {/* Waveform Seek Bar */}
      <div className="mb-2">
        <Waveform
          data={waveform}
          progress={playbackProgress}
          height={32}
          onSeek={handleSeek}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={togglePlay}
            disabled={!audioSrc || loadError}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${
              !audioSrc || loadError
                ? "bg-black/10 dark:bg-white/10 text-brand-text-secondary cursor-not-allowed"
                : "bg-brand-primary hover:bg-brand-primary-hover active:bg-[#3C563F] text-white"
            }`}
            title={isPlaying ? "Пауза" : "Воспроизвести"}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>

          {loadError ? (
            <span className="text-[11px] text-brand-danger flex items-center gap-1 truncate">
              <AlertCircle size={12} />
              <span>Файл не найден на диске</span>
            </span>
          ) : (
            <span className="text-xs font-medium text-brand-text-secondary dark:text-dark-text-secondary tabular-nums truncate">
              {formatSeconds(currentSeconds)} / {durationFormatted}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              disabled={!audioSrc || loadError}
              className="text-brand-text-secondary dark:text-dark-text-secondary disabled:opacity-40"
              title={volume > 0 ? "Выключить звук" : "Включить звук"}
              aria-label={volume > 0 ? "Выключить звук" : "Включить звук"}
            >
              {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setPlayerVolume(Number(event.target.value))}
              disabled={!audioSrc || loadError}
              aria-label="Громкость"
              className="w-16 accent-brand-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>

          <button
            onClick={toggleSpeed}
            disabled={!audioSrc || loadError}
            className="px-2 py-0.5 text-xs font-semibold rounded bg-black/5 dark:bg-white/5 text-brand-text dark:text-dark-text hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Скорость воспроизведения"
          >
            {speed}
          </button>
        </div>
      </div>
    </div>
  );
};
