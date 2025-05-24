# Unit tests

This folder holds the Mocha test suite for the Containerlab extension. The tests use simple stubs under `test/helpers` to emulate VS Code APIs so they can run outside of VS Code.

## Running the tests

1. Install all dependencies with `npm install`.
2. Compile the test sources via `npm run test:compile`.
3. Execute `npm test` to run the suite and generate an HTML report in `mochawesome-report`.

The provided scripts automatically compile the extension sources and output the transpiled test files to `out/test` before running Mocha.
