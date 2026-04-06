import { createRequire } from "module";

const require = createRequire(import.meta.url);
/** @type {import("eslint").Linter.Config[]} */
const eslintConfigNext = require("eslint-config-next");

export default eslintConfigNext;
