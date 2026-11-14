/**
 * Money Contracts and Safe Arithmetic for Vietnam-first Device Adviser
 * All monetary amounts are non-negative safe integers in VND.
 */

export const MAX_SAFE_VND = Number.MAX_SAFE_INTEGER;

export interface PriceBreakdownInput {
  /** Listed price from seller (must be non-negative safe integer) */
  basePriceVnd: number;
  /** Mandatory taxes and service fees EXCLUDING shipping fees, or null if unknown / unapproved */
  mandatoryFeesVnd: number | null;
  /** Shipping fee, or null if unknown / unverified */
  shippingVnd: number | null;
  /** Confirmed eligible discount, defaults to 0 if none */
  confirmedDiscountVnd?: number;
}

export interface PriceCalculationResult {
  /** Null if shipping or mandatory fee is unknown */
  totalVnd: number | null;
  /** True only when all mandatory components are known, verified, and total <= budgetCeiling */
  isComplete: boolean;
  breakdown: {
    basePriceVnd: number;
    mandatoryFeesVnd: number | null;
    shippingVnd: number | null;
    confirmedDiscountVnd: number;
  };
}

export class MoneyOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyOverflowError";
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

/**
 * Validates whether an amount is a valid, non-negative integer within safe limits.
 */
export function isValidVnd(amount: unknown): amount is number {
  return (
    typeof amount === "number" &&
    Number.isSafeInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_SAFE_VND
  );
}

/**
 * Calculates total VND payable cost with strict validation:
 * 1. mandatoryFeesVnd MUST NOT include shippingVnd.
 * 2. If shippingVnd is null, totalVnd is null (incomplete / unknown total).
 * 3. Prevents integer overflow and negative values.
 */
export function calculatePayableTotal(
  input: PriceBreakdownInput,
): PriceCalculationResult {
  const {
    basePriceVnd,
    mandatoryFeesVnd,
    shippingVnd,
    confirmedDiscountVnd = 0,
  } = input;

  if (!isValidVnd(basePriceVnd)) {
    throw new InvalidMoneyError(
      `Invalid basePriceVnd: ${basePriceVnd}. Must be a non-negative safe integer.`,
    );
  }

  if (mandatoryFeesVnd !== null && !isValidVnd(mandatoryFeesVnd)) {
    throw new InvalidMoneyError(
      `Invalid mandatoryFeesVnd: ${mandatoryFeesVnd}. Must be null or a non-negative safe integer.`,
    );
  }

  if (!isValidVnd(confirmedDiscountVnd)) {
    throw new InvalidMoneyError(
      `Invalid confirmedDiscountVnd: ${confirmedDiscountVnd}. Must be a non-negative safe integer.`,
    );
  }

  if (shippingVnd !== null && !isValidVnd(shippingVnd)) {
    throw new InvalidMoneyError(
      `Invalid shippingVnd: ${shippingVnd}. Must be null or a non-negative safe integer.`,
    );
  }

  // If mandatory fees are unknown, the complete payable total cannot be determined
  if (mandatoryFeesVnd === null) {
    return {
      totalVnd: null,
      isComplete: false,
      breakdown: {
        basePriceVnd,
        mandatoryFeesVnd: null,
        shippingVnd,
        confirmedDiscountVnd,
      },
    };
  }

  // Check overflow on addition of base and mandatory fees
  if (basePriceVnd > MAX_SAFE_VND - mandatoryFeesVnd) {
    throw new MoneyOverflowError(
      "Integer overflow calculating basePriceVnd + mandatoryFeesVnd",
    );
  }
  const subtotalWithoutShip = basePriceVnd + mandatoryFeesVnd;

  // If shipping is unknown, the total price cannot be determined
  if (shippingVnd === null) {
    return {
      totalVnd: null,
      isComplete: false,
      breakdown: {
        basePriceVnd,
        mandatoryFeesVnd,
        shippingVnd: null,
        confirmedDiscountVnd,
      },
    };
  }

  // Check overflow with shipping
  if (subtotalWithoutShip > MAX_SAFE_VND - shippingVnd) {
    throw new MoneyOverflowError("Integer overflow adding shippingVnd");
  }
  const grossTotal = subtotalWithoutShip + shippingVnd;

  // Subtract discount (total cannot be negative)
  const totalVnd = Math.max(0, grossTotal - confirmedDiscountVnd);

  return {
    totalVnd,
    isComplete: true,
    breakdown: {
      basePriceVnd,
      mandatoryFeesVnd,
      shippingVnd,
      confirmedDiscountVnd,
    },
  };
}
