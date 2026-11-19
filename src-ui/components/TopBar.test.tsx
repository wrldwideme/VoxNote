import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

describe("TopBar", () => {
  it("locks record parameters and relies on the native Windows frame", () => {
    render(
      <TopBar
        modelName="Быстрая (small)"
        devicePreference="cuda"
        deviceLabel="Видеокарта NVIDIA (CUDA)"
        dictionaryName="Без словаря"
        theme="light"
        controlsLocked
        contextLabel="Параметры этой записи"
        onOpenModels={vi.fn()}
        onOpenDictionaries={vi.fn()}
        onToggleDevice={vi.fn()}
        onToggleTheme={vi.fn()}
        onOpenPrivacyInfo={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Модель.*Быстрая/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Устройство.*Видеокарта NVIDIA/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Словарь.*Без словаря/ })).toBeDisabled();
    expect(screen.queryByTitle("Свернуть")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Развернуть")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Закрыть")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Проверить обновления VoxNote")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Справка о локальной приватности")).not.toBeInTheDocument();
  });
});
