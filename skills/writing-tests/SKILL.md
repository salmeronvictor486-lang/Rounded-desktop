---
name: writing-tests
description: How to write tests that are fast, deterministic and meaningful — naming, structure, test doubles, fixtures, coverage targets and what to test at each level. Use when adding tests, improving a weak suite, or deciding how to test a piece of code.
---

# Writing good tests

A test is valuable if it fails when the behaviour breaks and passes otherwise. Everything else is secondary.

## Properties

- **Behavioural:** exercise the public interface; assert outcomes, not internals.
- **Deterministic:** no real clock, randomness, network or ordering assumptions. Inject a clock, seed generators, fake the network.
- **Isolated:** each test sets up its own data and cleans up; tests pass in any order and in parallel.
- **Fast:** milliseconds for unit tests; slow tests run less often and get ignored.
- **Readable:** a failing test's name and assertion message tell you what broke without reading the code.

## Structure

```
test('applies a 10% discount to orders over 100', () => {
  // Arrange
  const order = makeOrder({ subtotal: 120 });
  // Act
  const total = priceOrder(order);
  // Assert
  expect(total).toBe(108);
});
```

- One behaviour per test. Multiple assertions are fine if they describe the same behaviour.
- No conditionals or loops in tests; use parameterised tests (`test.each`, `pytest.mark.parametrize`, table-driven tests in Go) for many cases.
- Build test data with small factories that set sensible defaults and let each test override what matters.

## Test doubles

| Double | Use for |
|---|---|
| Fake (in-memory repository, fake clock) | your own interfaces; most realistic and least brittle |
| Stub (returns canned data) | simple collaborators where you only need an answer |
| Mock (verifies calls) | outgoing side effects you must prove happened (email sent, event published) |
| Real dependency in a container | databases, queues, search engines in integration tests |

Mock at the edges of your system, not between your own classes.

## What to test where

- **Unit:** pure logic, parsing, validation, calculations, state machines.
- **Integration:** SQL queries against a real engine, HTTP handlers with the framework's test client, serialisation formats.
- **Contract:** APIs consumed by other teams; schema tests on both sides.
- **End-to-end:** a handful of critical journeys.

## Coverage

Use coverage to find untested code, not as a goal. 80% line coverage with meaningful assertions beats 100% with none. Critical paths (money, auth, data deletion) deserve branch-level coverage.

## Smells

- Tests that need many mocks → the unit has too many responsibilities.
- Tests that break on every refactor → they test implementation details.
- Tests that pass when the code is deleted → missing or weak assertions.
- Sleeps → replace with waiting on a condition or a fake clock.
