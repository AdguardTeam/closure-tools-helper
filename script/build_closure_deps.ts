import DepsSorter from '../src/DepsSorter';
import log = require('fancy-log');

async function main() {
    try {
        await DepsSorter.distillClosureDeps();
    } catch(e) {
        log.error(e);
        process.exit(1);        
    }
    process.exit(0);
}

main();
