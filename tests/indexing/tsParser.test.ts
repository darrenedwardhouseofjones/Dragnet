import { describe, it, expect } from "vitest";
import { parseFileSymbols as tsParse } from "../../src/services/indexing/tsParser";
import { LegacyRegexParser } from "../../src/services/indexing/legacyRegexParser";

const REPO_ID = "test-repo";

/**
 * Parity + correctness tests for the tree-sitter TS/JS parser.
 *
 * Three layers:
 *   1. Correctness — does the parser extract what's actually there?
 *   2. Stability — same input → same symbol IDs across re-parses?
 *   3. Parity — does it agree with the legacy regex parser on obvious cases
 *      (named functions, classes) AND correctly fix known regex bugs?
 *
 * Fixtures live inline (no fs reads) so the tests run anywhere.
 */

describe("tsParser — symbol extraction", () => {
  it("extracts a named function declaration with correct line range", async () => {
    const src = `
function foo() {
  return 1;
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({
      name: "foo",
      kind: "function",
      lineStart: 1,
      lineEnd: 3,
    });
  });

  it("extracts async functions", async () => {
    const src = `async function fetchThing() { return await fetch("/"); }`;
    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({ name: "fetchThing", kind: "function" });
  });

  it("extracts TypeScript generics without dropping the function", async () => {
    const src = `function identity<T>(x: T): T { return x; }`;
    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({ name: "identity", kind: "function" });
  });

  it("extracts class declarations", async () => {
    const src = `
class Foo {
  constructor() {}
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const cls = result.symbols.find((s) => s.kind === "class");
    expect(cls).toMatchObject({ name: "Foo", lineStart: 1, lineEnd: 3 });
  });

  it("extracts methods including private (#name) and static", async () => {
    const src = `
class Service {
  public handler() {}
  protected check() {}
  private secret() {}
  static of() {}
  #privateMethod() {}
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const methodNames = result.symbols
      .filter((s) => s.kind === "method")
      .map((s) => s.name)
      .sort();
    // Note: #privateMethod keeps the # prefix — JS treats #foo and foo as
    // distinct identifiers, and call sites like this.#foo() carry the #
    // in their property_identifier text too, so graph resolution matches.
    expect(methodNames).toEqual(
      ["#privateMethod", "check", "handler", "of", "secret"].sort(),
    );
  });

  it("extracts arrow functions assigned to const", async () => {
    const src = `
const add = (a: number, b: number) => a + b;
const asyncWork = async () => { await fetch("/"); };
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const arrowNames = result.symbols.map((s) => s.name).sort();
    expect(arrowNames).toEqual(["add", "asyncWork"]);
  });

  it("extracts function_expression assigned to const", async () => {
    const src = `const fn = function named() { return 1; };`;
    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({ name: "fn", kind: "function" });
  });

  it("does NOT miscategorize module-scope functions as methods", async () => {
    // The regex parser would tag `helper` as a "method" because it
    // appeared after a class declaration in the same file, even though
    // it's outside the class body. Tree-sitter gets this right.
    const src = `
class Bar {}
function helper() {}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const helper = result.symbols.find((s) => s.name === "helper");
    expect(helper?.kind).toBe("function");
  });

  it("handles JSX/TSX correctly via the tsx grammar", async () => {
    const src = `
function Card(props: { name: string }) {
  return <div>{props.name}</div>;
}
`.trim();

    const result = await tsParse(REPO_ID, "Card.tsx", src);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toMatchObject({ name: "Card", kind: "function" });
  });

  it("returns correct lineEnd for multi-line function bodies (no brace-counting drift)", async () => {
    // The regex parser's brace counter miscounts when the body contains
    // template literals with `{` inside. Tree-sitter gives exact ranges.
    const src = `
function greet(name: string) {
  const msg = \`Hello \${name}! You have \${5} new messages.\`;
  return msg;
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.symbols[0]).toMatchObject({ lineStart: 1, lineEnd: 4 });
  });

  it("ignores commented-out function declarations", async () => {
    // `// function fake() {` would fool the regex parser into extracting
    // a phantom symbol. Tree-sitter parses comments as comment nodes.
    const src = `
// function fake() {
function real() {}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const names = result.symbols.map((s) => s.name);
    expect(names).toEqual(["real"]);
    expect(names).not.toContain("fake");
  });
});

describe("tsParser — call extraction", () => {
  it("extracts bare function calls with correct enclosing symbol", async () => {
    const src = `
function outer() {
  inner();
}
function inner() {}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const innerCall = result.rawCalls.find((c) => c.toRaw === "inner");
    expect(innerCall).toMatchObject({ fromSymbolName: "outer", line: 2 });
  });

  it("extracts method calls (foo.bar())", async () => {
    const src = `
function handler(svc: Service) {
  svc.process();
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const call = result.rawCalls.find((c) => c.toRaw === "process");
    expect(call).toMatchObject({ fromSymbolName: "handler" });
  });

  it("does NOT extract control-flow keywords as calls", async () => {
    // The regex parser would happily match `if (`, `for (`, `switch (`
    // because they look like calls to a function named `if`/`for`/`switch`.
    const src = `
function run(items: number[]) {
  if (items.length > 0) {
    for (const x of items) {
      while (x > 0) {}
    }
    switch (x) {
      case 1: break;
    }
  }
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const phantomCallees = result.rawCalls
      .map((c) => c.toRaw)
      .filter((n) => ["if", "for", "while", "switch", "case"].includes(n));
    expect(phantomCallees).toEqual([]);
  });

  it("attributes calls inside methods to the method, not the class", async () => {
    const src = `
class Service {
  handle() {
    this.process();
  }
}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    const call = result.rawCalls.find((c) => c.toRaw === "process");
    expect(call?.fromSymbolName).toBe("handle");
  });

  it("drops module-top-level calls (no enclosing symbol)", async () => {
    const src = `
configure({ debug: true });
function main() {}
`.trim();

    const result = await tsParse(REPO_ID, "test.ts", src);
    expect(result.rawCalls).toEqual([]);
  });
});

describe("tsParser — stability", () => {
  it("produces identical output across two parses of the same input", async () => {
    const src = `
class Foo {
  bar() {
    return this.baz();
  }
  baz() { return 1; }
}
const main = () => new Foo().bar();
`.trim();

    const a = await tsParse(REPO_ID, "test.ts", src);
    const b = await tsParse(REPO_ID, "test.ts", src);

    expect(b.symbols).toEqual(a.symbols);
    expect(b.rawCalls).toEqual(a.rawCalls);
  });

  it("produces stable sourceHash values (drives incremental indexing)", async () => {
    const src = `function stable() { return 1; }`;
    const a = await tsParse(REPO_ID, "test.ts", src);
    const b = await tsParse(REPO_ID, "test.ts", src);
    expect(a.symbols[0].sourceHash).toEqual(b.symbols[0].sourceHash);
  });
});

describe("tsParser — parity with legacy regex parser", () => {
  it("agrees on named function extraction for simple cases", async () => {
    const src = `
function alpha() {}
function beta() {}
`.trim();

    const tsResult = await tsParse(REPO_ID, "test.ts", src);
    const legacyResult = LegacyRegexParser.parseFileSymbols(REPO_ID, "test.ts", src);

    const tsNames = tsResult.symbols.map((s) => s.name).sort();
    const legacyNames = legacyResult.symbols.map((s) => s.name).sort();
    expect(tsNames).toEqual(legacyNames);
  });

  it("agrees on class extraction", async () => {
    const src = `
class Service {}
class Repository {}
`.trim();

    const tsResult = await tsParse(REPO_ID, "test.ts", src);
    const legacyResult = LegacyRegexParser.parseFileSymbols(REPO_ID, "test.ts", src);

    const tsClasses = tsResult.symbols.filter((s) => s.kind === "class").map((s) => s.name).sort();
    const legacyClasses = legacyResult.symbols.filter((s) => s.kind === "class").map((s) => s.name).sort();
    expect(tsClasses).toEqual(legacyClasses);
  });

  it("correctly skips phantom symbols from comments (regex parser's blind spot)", async () => {
    // The regex parser happily matches `function fake() {` even when it's
    // inside a comment, producing phantom symbols. Tree-sitter parses
    // comments as comment nodes and never confuses them with declarations.
    const src = `
// function fake() {
function real() {}
`.trim();

    const tsResult = await tsParse(REPO_ID, "test.ts", src);
    const legacyResult = LegacyRegexParser.parseFileSymbols(REPO_ID, "test.ts", src);

    expect(tsResult.symbols.map((s) => s.name)).toEqual(["real"]);
    // Document the regex bug we're replacing:
    expect(legacyResult.symbols.map((s) => s.name)).toContain("fake");
  });

  it("extracts private methods the regex parser cannot see", async () => {
    const src = `
class Foo {
  #privateMethod() {}
  regular() {}
}
`.trim();

    const tsResult = await tsParse(REPO_ID, "test.ts", src);
    const legacyResult = LegacyRegexParser.parseFileSymbols(REPO_ID, "test.ts", src);

    expect(tsResult.symbols.map((s) => s.name)).toContain("#privateMethod");
    expect(legacyResult.symbols.map((s) => s.name)).not.toContain("#privateMethod");
  });
});
