import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Money from "@/app/(dashboard)/_components/Money";
import Shares from "@/app/(dashboard)/_components/Shares";
import { HIDE_MONEY_COOKIE, parseHideMoney } from "./money-cookie";
import { MASK, MoneyVisibilityProvider, useMoneyFormat, useMoneyVisibility } from "./money-visibility";

afterEach(() => {
  // This config does not set `globals: true`, so Testing Library's automatic
  // cleanup never registers — unmount by hand or renders stack up.
  cleanup();
  // jsdom keeps one cookie jar per document, so clear it between cases.
  document.cookie = `${HIDE_MONEY_COOKIE}=; path=/; max-age=0`;
});

function withProvider(ui: React.ReactNode, initialHidden = false) {
  return render(<MoneyVisibilityProvider initialHidden={initialHidden}>{ui}</MoneyVisibilityProvider>);
}

describe("parseHideMoney", () => {
  it.each([
    ["1", true],
    ["0", false],
    [undefined, false],
    ["", false],
    ["true", false],
    ["yes", false],
  ])("should read %s as %s", (raw, expected) => {
    expect(parseHideMoney(raw)).toBe(expected);
  });
});

/** Reads the context and exposes both the state and a way to flip it. */
function Probe() {
  const { hidden, setHidden } = useMoneyVisibility();
  return (
    <button
      type="button"
      onClick={() => {
        setHidden(!hidden);
      }}
    >
      {hidden ? "hidden" : "visible"}
    </button>
  );
}

describe("MoneyVisibilityProvider", () => {
  it("should start visible when the cookie was absent", () => {
    withProvider(<Probe />);
    expect(screen.getByRole("button")).toHaveTextContent("visible");
  });

  // The server passes the cookie down, which is what makes the first paint
  // already masked instead of flashing real amounts.
  it("should start hidden when seeded from the server-read cookie", () => {
    withProvider(<Probe />, true);
    expect(screen.getByRole("button")).toHaveTextContent("hidden");
  });

  it("should flip the state when toggled", async () => {
    withProvider(<Probe />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("hidden");
  });

  it("should persist the choice to the cookie so it survives a reload", async () => {
    withProvider(<Probe />);
    expect(document.cookie).toContain(`${HIDE_MONEY_COOKIE}=0`);

    await userEvent.click(screen.getByRole("button"));

    expect(document.cookie).toContain(`${HIDE_MONEY_COOKIE}=1`);
  });
});

describe("useMoneyVisibility", () => {
  // Failing open would silently reveal every amount on the page, so a missing
  // provider has to be loud.
  it("should throw when used outside a provider", () => {
    // -- React logs the render error itself; keep the test output readable.
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- silencing the log is the whole point
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow("must be used within a MoneyVisibilityProvider");

    consoleError.mockRestore();
  });
});

describe("useMoneyFormat", () => {
  function FormatProbe({ value, decimals }: { value: number; decimals?: number }) {
    const money = useMoneyFormat();
    return <span data-testid="out">{money(value, decimals)}</span>;
  }

  it("should format the amount when prices are visible", () => {
    withProvider(<FormatProbe value={1234.5} />);
    expect(screen.getByTestId("out")).toHaveTextContent("1,234.50");
  });

  it("should honour the decimals argument", () => {
    withProvider(<FormatProbe value={12.3456} decimals={4} />);
    expect(screen.getByTestId("out")).toHaveTextContent("12.3456");
  });

  it("should return the mask when prices are hidden", () => {
    withProvider(<FormatProbe value={1234.5} />, true);
    expect(screen.getByTestId("out")).toHaveTextContent(MASK);
  });
});

describe("Money", () => {
  it("should render the formatted amount when prices are visible", () => {
    withProvider(<Money value={1234.5} />);
    expect(screen.getByText("1,234.50")).toBeInTheDocument();
  });

  it("should render the mask when prices are hidden", () => {
    const { container } = withProvider(<Money value={1234.5} />, true);
    expect(container).toHaveTextContent(MASK);
    expect(container).not.toHaveTextContent("1,234.50");
  });

  it("should respect the decimals prop", () => {
    withProvider(<Money value={12.3456} decimals={4} />);
    expect(screen.getByText("12.3456")).toBeInTheDocument();
  });

  it("should prefix a plus on a non-negative signed amount", () => {
    const { container } = withProvider(<Money value={50} signed />);
    expect(container).toHaveTextContent("+50.00");
  });

  it("should leave a negative signed amount to its own minus sign", () => {
    const { container } = withProvider(<Money value={-50} signed />);
    expect(container).toHaveTextContent("-50.00");
  });

  // The +/- would leak direction on its own, and there is nothing to sign.
  it("should drop the sign along with the digits when hidden", () => {
    const { container } = withProvider(<Money value={50} signed />, true);
    expect(container).toHaveTextContent(MASK);
    expect(container).not.toHaveTextContent("+");
  });
});

describe("Shares", () => {
  it("should render the share count when prices are visible", () => {
    withProvider(<Shares value={12345} />);
    expect(screen.getByText("12,345")).toBeInTheDocument();
  });

  // A share count plus a public share price gives away the position's value.
  it("should render the mask when prices are hidden", () => {
    const { container } = withProvider(<Shares value={12345} />, true);
    expect(container).toHaveTextContent(MASK);
    expect(container).not.toHaveTextContent("12,345");
  });

  it("should keep fractional share counts intact when visible", () => {
    withProvider(<Shares value={0.05123456} />);
    expect(screen.getByText("0.05123456")).toBeInTheDocument();
  });
});
