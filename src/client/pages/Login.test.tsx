import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Login from "./Login";

const { mockPost, mockGet, mockNavigate, mockRefresh } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockNavigate: vi.fn(),
  mockRefresh: vi.fn()
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: { get: mockGet, post: mockPost }
  };
});

vi.mock("../lib/SessionContext", () => ({
  useSession: () => ({ refresh: mockRefresh })
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

beforeEach(() => {
  mockGet.mockResolvedValue({});
  mockRefresh.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Login", () => {
  it("starts on the email step", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send OTP" })).toBeInTheDocument();
  });

  it("requests an OTP and moves to the code step on success", async () => {
    mockPost.mockResolvedValueOnce(undefined);
    render(<Login />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/auth/request-otp",
        expect.objectContaining({ email: "learner@example.com" })
      );
    });

    expect(await screen.findByRole("heading", { name: "Enter the code" })).toBeInTheDocument();
  });

  it("shows the server's error message and stays on the email step if the request fails", async () => {
    const { ApiError } = await import("../lib/api");
    mockPost.mockRejectedValueOnce(new ApiError(429, "rate_limited", "Too many attempts. Try again in a minute."));
    render(<Login />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));

    expect(await screen.findByText("Too many attempts. Try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send OTP" })).toBeInTheDocument();
  });

  it("verifies the code, refreshes the session, and navigates to /learn", async () => {
    mockPost.mockResolvedValueOnce(undefined);
    render(<Login />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await screen.findByRole("heading", { name: "Enter the code" });

    mockPost.mockResolvedValueOnce(undefined);
    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/auth/verify-otp", { email: "learner@example.com", code: "123456" });
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/learn");
  });
});
