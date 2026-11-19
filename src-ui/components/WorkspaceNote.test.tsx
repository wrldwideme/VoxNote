import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryEntry } from "../types/ipc";
import { WorkspaceNote } from "./WorkspaceNote";

const stoppedEntry: HistoryEntry = {
  id: "stopped-1",
  created_at: "19.11.2026 18:45",
  file_name: "лекция.m4a",
  title: "Лекция",
  display_title: "Лекция",
  duration_seconds: 600,
  duration_formatted: "10:00",
  model_id: "small",
  device: "cuda",
  dictionary_id: null,
  text: "Сохранённая часть.",
  preview: "Сохранённая часть.",
  edited_text: null,
  current_text: "Сохранённая часть.",
  has_edits: false,
  segments: [{ start: 0, end: 120, text: "Сохранённая часть." }],
  file_path: "C:\\audio\\лекция.m4a",
  status: "cancelled",
  resume_from_seconds: 120,
  file_available: true,
  revisions: [],
};

describe("WorkspaceNote", () => {
  it("shows a stopped badge and resumes a partial transcription", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(
      <WorkspaceNote
        entry={stoppedEntry}
        onUpdateText={vi.fn()}
        onUpdateTitle={vi.fn()}
        onResumeTranscription={onResume}
      />
    );

    expect(screen.getByText("Остановлено")).toBeVisible();
    expect(screen.getByText(/Продолжение начнётся с 120 сек/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onResume).toHaveBeenCalledWith(stoppedEntry);
  });

  it("closes a note without deleting it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <WorkspaceNote
        entry={stoppedEntry}
        onUpdateText={vi.fn()}
        onUpdateTitle={vi.fn()}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: "Закрыть заметку" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps text available and requests relinking when the source audio is missing", async () => {
    const user = userEvent.setup();
    const onRelink = vi.fn();
    const missingEntry = { ...stoppedEntry, file_available: false };
    render(
      <WorkspaceNote
        entry={missingEntry}
        onUpdateText={vi.fn()}
        onUpdateTitle={vi.fn()}
        onResumeTranscription={vi.fn()}
        onRelinkAudio={onRelink}
      />
    );

    expect(screen.getAllByText("Сохранённая часть.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Указать файл" }));
    expect(onRelink).toHaveBeenCalledWith(missingEntry);
  });

  it("restores a saved text revision", async () => {
    const user = userEvent.setup();
    const onUpdateText = vi.fn();
    render(
      <WorkspaceNote
        entry={{
          ...stoppedEntry,
          revisions: [{ created_at: "19.11.2026 18:40:00", text: "Предыдущая версия." }],
        }}
        onUpdateText={onUpdateText}
        onUpdateTitle={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "История правок" }));
    expect(screen.getByText("Предыдущая версия.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Восстановить" }));
    expect(onUpdateText).toHaveBeenCalledWith("Предыдущая версия.");
  });
});
