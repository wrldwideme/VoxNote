import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sidecarClient, type RuntimeInstallProgress, type RuntimeStatus } from "../api/client";
import { RuntimeSetup } from "./RuntimeSetup";

const status: RuntimeStatus = {
  ready: false,
  core_installed: false,
  nvidia_installed: false,
  installing: false,
  dev_runtime: false,
  runtime_version: "1.0.0",
  runtime_root: "C:\\runtime",
  executable: "",
  core_size_bytes: 92_511_472,
  nvidia_size_bytes: 699_790_401,
};

describe("RuntimeSetup", () => {
  let progressListener: ((progress: RuntimeInstallProgress) => void) | null;

  beforeEach(() => {
    progressListener = null;
    vi.spyOn(sidecarClient, "onRuntimeInstallProgress").mockImplementation(async (listener) => {
      progressListener = listener;
      return () => undefined;
    });
    vi.spyOn(sidecarClient, "onRuntimeInstallFinished").mockResolvedValue(() => undefined);
    vi.spyOn(sidecarClient, "onRuntimeInstallFailed").mockResolvedValue(() => undefined);
    vi.spyOn(sidecarClient, "installRuntime").mockResolvedValue(undefined);
    vi.spyOn(sidecarClient, "cancelRuntimeInstall").mockResolvedValue(undefined);
  });

  it("does not download anything until the user chooses a profile", () => {
    render(<RuntimeSetup status={status} onReady={vi.fn()} />);

    expect(sidecarClient.installRuntime).not.toHaveBeenCalled();
    expect(screen.getByText("88 МБ")).toBeInTheDocument();
    expect(screen.getByText("756 МБ")).toBeInTheDocument();
  });

  it("installs the NVIDIA profile only after an explicit click", async () => {
    const user = userEvent.setup();
    render(<RuntimeSetup status={status} onReady={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Видеокарта NVIDIA/ }));

    expect(sidecarClient.installRuntime).toHaveBeenCalledWith("nvidia");
    expect(screen.getByText("Начинаем установку…")).toBeInTheDocument();
  });

  it("shows real progress and lets the user cancel", async () => {
    const user = userEvent.setup();
    render(<RuntimeSetup status={status} onReady={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Процессор \(CPU\)/ }));

    progressListener?.({
      package: "core",
      phase: "downloading",
      downloaded_bytes: 46_255_736,
      total_bytes: 92_511_472,
      percent: 50,
    });

    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Скачиваем движок…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отменить" }));
    expect(sidecarClient.cancelRuntimeInstall).toHaveBeenCalledOnce();
  });
});
