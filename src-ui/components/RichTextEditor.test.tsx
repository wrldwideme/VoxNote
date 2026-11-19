import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("renders stored Markdown as formatted text instead of showing markers", async () => {
    render(
      <RichTextEditor
        value={"## Заголовок\n\nЭто **важный** фрагмент."}
        onChange={vi.fn()}
      />
    );

    const editor = await screen.findByLabelText("Редактор конспекта");
    expect(editor.querySelector("h2")).toHaveTextContent("Заголовок");
    expect(editor.querySelector("strong")).toHaveTextContent("важный");
    expect(editor).not.toHaveTextContent("**важный**");
  });

  it("stores rich formatting back as Markdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);

    const editor = await screen.findByLabelText("Редактор конспекта");
    const boldButton = screen.getByRole("button", { name: "Жирный" });
    await user.click(boldButton);
    expect(boldButton).toHaveAttribute("aria-pressed", "true");
    (editor as HTMLElement).focus();
    await user.keyboard("Важное");

    expect(onChange).toHaveBeenLastCalledWith("**Важное**");
  });

  it("offers the document formatting commands and an inline link editor", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor value="Текст" onChange={vi.fn()} />);

    await screen.findByLabelText("Редактор конспекта");
    expect(screen.getByRole("combobox", { name: "Стиль абзаца" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Подчёркивание" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Выделить маркером" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Цитата" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Добавить ссылку" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Добавить ссылку" }));
    expect(screen.getByRole("textbox", { name: "Адрес ссылки" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Применить" })).toBeVisible();
  });
});
