import { describe, it, expect, vi, afterEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useDialogA11y } from "./useDialogA11y";

function DialogHarness({ active, onClose }: { active: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, { active, onClose });
  return (
    <div>
      <button>Outside trigger</button>
      {active && (
        <div ref={panelRef} data-testid="panel">
          <button>First</button>
          <button>Last</button>
        </div>
      )}
    </div>
  );
}

afterEach(() => cleanup());

describe("useDialogA11y", () => {
  it("moves focus into the panel's first focusable element when it activates", () => {
    render(<DialogHarness active={true} onClose={() => {}} />);
    expect(screen.getByText("First")).toHaveFocus();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<DialogHarness active={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    render(<DialogHarness active={true} onClose={() => {}} />);
    const last = screen.getByText("Last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("First")).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    render(<DialogHarness active={true} onClose={() => {}} />);
    expect(screen.getByText("First")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Last")).toHaveFocus();
  });

  it("restores focus to whatever had it before the dialog opened, once closed", () => {
    const { rerender } = render(<DialogHarness active={false} onClose={() => {}} />);
    const trigger = screen.getByText("Outside trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<DialogHarness active={true} onClose={() => {}} />);
    expect(trigger).not.toHaveFocus();

    rerender(<DialogHarness active={false} onClose={() => {}} />);
    expect(trigger).toHaveFocus();
  });

  it("does nothing when active is false", () => {
    const onClose = vi.fn();
    render(<DialogHarness active={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
