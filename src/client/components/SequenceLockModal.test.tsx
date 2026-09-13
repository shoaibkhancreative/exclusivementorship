import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SequenceLockModal } from "./SequenceLockModal";

afterEach(() => cleanup());

describe("SequenceLockModal", () => {
  it("renders the given message inside a labeled dialog", () => {
    render(<SequenceLockModal message="Finish the previous class first." onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Class locked" })).toBeInTheDocument();
    expect(screen.getByText("Finish the previous class first.")).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();
    render(<SequenceLockModal message="Locked." onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed (useDialogA11y)", () => {
    const onClose = vi.fn();
    render(<SequenceLockModal message="Locked." onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop (not the panel) is clicked", () => {
    const onClose = vi.fn();
    render(<SequenceLockModal message="Locked." onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog", { name: "Class locked" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when the panel itself is clicked (only the backdrop should)", () => {
    const onClose = vi.fn();
    render(<SequenceLockModal message="Locked." onClose={onClose} />);
    fireEvent.click(screen.getByText("Locked."));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the panel on open (useDialogA11y)", () => {
    render(<SequenceLockModal message="Locked." onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});
