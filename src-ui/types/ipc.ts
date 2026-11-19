export type ThemeMode = "light" | "dark" | "system";
export type DevicePreference = "auto" | "cuda" | "cpu";

export interface AudioMetadata {
  file_path: string;
  file_name: string;
  file_size: number;
  duration_seconds: number | null;
  sample_rate?: number;
  channels?: number;
  codec?: string;
  waveform: number[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface HistoryRevision {
  created_at: string;
  text: string;
}

export interface HistoryEntry {
  id: string;
  created_at: string;
  file_name: string;
  title: string;
  display_title: string;
  duration_seconds: number | null;
  duration_formatted: string;
  model_id: string;
  device: string;
  dictionary_id: string | null;
  text: string;
  preview: string;
  edited_text: string | null;
  current_text: string;
  has_edits: boolean;
  segments: TranscriptSegment[];
  file_path?: string;
  waveform?: number[];
  status: "completed" | "cancelled" | "interrupted" | "in_progress";
  resume_from_seconds: number;
  file_available: boolean;
  revisions: HistoryRevision[];
}

export interface HistoryGroup {
  group_name: "Сегодня" | "На этой неделе" | "Ранее" | string;
  entries: HistoryEntry[];
}

export interface ModelOption {
  model_id: string;
  name: string;
  summary: string;
  size_bytes: number;
  size_text: string;
  recommended: boolean;
  installed: boolean;
  selected: boolean;
}

export interface DictionaryOption {
  id: string;
  name: string;
  description: string;
  term_count: number;
  available: boolean;
  selected: boolean;
  source: string;
}

export interface DeviceOption {
  deviceId: DevicePreference;
  name: string;
  summary: string;
  available: boolean;
  selected: boolean;
}

export interface SystemInfo {
  version: string;
  state: string;
  device_capabilities: {
    cuda_available: boolean;
    gpu_name: string | null;
    gpu_label: string;
    total_memory_mb: number | null;
    unavailable_reason: string | null;
  };
  device_preference: DevicePreference;
  selected_model: string;
  model_available: boolean;
  installed_models: string[];
  selected_dictionary: string;
  has_custom_dictionary: boolean;
  theme: ThemeMode;
  reduce_motion: boolean;
  appearance?: string;
  animations_reduced?: boolean;
}

export interface TranscriptionProgress {
  processed_seconds: number;
  total_seconds: number | null;
  elapsed_seconds: number;
  percent: number | null;
  remaining_percent: number | null;
  eta_seconds: number | null;
  eta_formatted: string;
}

export interface TranscriptionCompleted {
  text: string;
  model_id: string;
  device: string;
  dictionary_id: string | null;
  incomplete: boolean;
  segments: TranscriptSegment[];
  history_entry: HistoryEntry;
}

export interface TranscriptionError {
  message: string;
  recoverable_on_cpu: boolean;
}

export interface ModelDownloadProgress {
  model_id: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  percent: number;
  phase: string;
}
