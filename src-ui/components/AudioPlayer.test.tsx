import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

describe("AudioPlayer", () => {
  it("changes volume and supports mute", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AudioPlayer audioPath="C:\\audio\\лекция.wav" durationFormatted="01:00" />
    );
    const audio = container.querySelector("audio")!;
    const volume = screen.getByRole("slider", { name: "Громкость" });

    fireEvent.change(volume, { target: { value: "0.4" } });
    expect(audio.volume).toBeCloseTo(0.4);

    await user.click(screen.getByRole("button", { name: "Выключить звук" }));
    expect(audio.volume).toBe(0);
    expect(screen.getByRole("button", { name: "Включить звук" })).toBeVisible();
  });
});
