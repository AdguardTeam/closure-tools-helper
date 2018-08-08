"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DepsSorter_1 = require("../src/DepsSorter");
const log = require("fancy-log");
async function main() {
    try {
        await DepsSorter_1.default.distillClosureDeps();
    }
    catch (e) {
        log.error(e);
        process.exit(1);
    }
    process.exit(0);
}
main();
