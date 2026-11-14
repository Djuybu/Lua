import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePayableTotal,
  isValidVnd,
  MoneyOverflowError,
  InvalidMoneyError,
  MAX_SAFE_VND
} from '../src/contracts/money.ts';

test('Money - isValidVnd validates safe integer amounts', () => {
  assert.equal(isValidVnd(0), true);
  assert.equal(isValidVnd(15000000), true);
  assert.equal(isValidVnd(MAX_SAFE_VND), true);
  assert.equal(isValidVnd(-1), false);
  assert.equal(isValidVnd(15000.5), false);
  assert.equal(isValidVnd(Number.MAX_VALUE), false);
  assert.equal(isValidVnd('15000000'), false);
  assert.equal(isValidVnd(null), false);
  assert.equal(isValidVnd(undefined), false);
});

test('Money - calculatePayableTotal with complete known components', () => {
  // Oracle case from test pack: 20M base + 300k fees + 200k ship - 500k discount = 20M VND
  const res = calculatePayableTotal({
    basePriceVnd: 20_000_000,
    mandatoryFeesVnd: 300_000,
    shippingVnd: 200_000,
    confirmedDiscountVnd: 500_000
  });

  assert.equal(res.isComplete, true);
  assert.equal(res.totalVnd, 20_000_000);
  assert.equal(res.breakdown.basePriceVnd, 20_000_000);
  assert.equal(res.breakdown.mandatoryFeesVnd, 300_000);
  assert.equal(res.breakdown.shippingVnd, 200_000);
  assert.equal(res.breakdown.confirmedDiscountVnd, 500_000);
});

test('Money - null shipping produces null totalVnd and isComplete = false', () => {
  const res = calculatePayableTotal({
    basePriceVnd: 20_000_000,
    mandatoryFeesVnd: 300_000,
    shippingVnd: null
  });

  assert.equal(res.isComplete, false);
  assert.equal(res.totalVnd, null);
  assert.equal(res.breakdown.shippingVnd, null);
});

test('Money - budget boundary test: ceiling vs 1 VND over', () => {
  const ceiling = 20_000_000;
  
  // Exactly at ceiling
  const exact = calculatePayableTotal({
    basePriceVnd: 19_800_000,
    mandatoryFeesVnd: 150_000,
    shippingVnd: 50_000
  });
  assert.equal(exact.totalVnd, ceiling);
  assert.equal(exact.totalVnd! <= ceiling, true);

  // Exceeds by 1 VND
  const overOne = calculatePayableTotal({
    basePriceVnd: 19_800_001,
    mandatoryFeesVnd: 150_000,
    shippingVnd: 50_000
  });
  assert.equal(overOne.totalVnd, ceiling + 1);
  assert.equal(overOne.totalVnd! <= ceiling, false);
});

test('Money - overflow protection throws MoneyOverflowError', () => {
  assert.throws(
    () => {
      calculatePayableTotal({
        basePriceVnd: MAX_SAFE_VND,
        mandatoryFeesVnd: 1000,
        shippingVnd: 0
      });
    },
    MoneyOverflowError
  );
});

test('Money - negative or invalid inputs throw InvalidMoneyError', () => {
  assert.throws(
    () => {
      calculatePayableTotal({
        basePriceVnd: -100,
        mandatoryFeesVnd: 0,
        shippingVnd: 0
      });
    },
    InvalidMoneyError
  );
});
