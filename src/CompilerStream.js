"use strict";
/**
 * @fileoverview It spawn a java process with provided arguments, and pipes stdout to
 * a stream that can be used with gulp plugins.
 * This is based on gulp plugin of google-closure-compiler package.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Vinyl = require("vinyl");
const log = require("fancy-log");
const child_process_1 = require("child_process");
const stream_1 = require("stream");
class CompilerStream extends stream_1.Stream.Transform {
    constructor(jarPath, args, outPath = 'dummy', postCompilationHook) {
        super({ objectMode: true });
        this.jarPath = jarPath;
        this.args = args;
        this.outPath = outPath;
        this.postCompilationHook = postCompilationHook;
    }
    _transform(file, enc, cb) {
        // ignore empty files
        if (file.isNull()) {
            cb();
            return;
        }
        this.emit('error', new Error(`Streaming not supported`));
        cb();
    }
    _flush(cb) {
        this.doCompilation()
            .then((file) => {
            if (file) {
                this.push(file);
            }
            cb();
        })
            .catch((err) => {
            log.error(`Unknown error from ${this.jarPath}\n${err.message}`);
            cb();
        });
    }
    /**
     * This is to make api similar to google-closure-compiler
     */
    src() {
        process.nextTick(() => {
            let stdInStream = new stream_1.Stream.Readable({
                read: function () {
                    return new Vinyl();
                }
            });
            stdInStream.pipe(this);
            stdInStream.push(null);
        });
        this.resume();
        return this;
    }
    async doCompilation() {
        const process = child_process_1.spawn('java', ['-jar', this.jarPath, ...this.args]);
        let stdOutData = '';
        let stdErrData = '';
        process.stdout.on('data', (data) => {
            stdOutData += data;
        });
        process.stderr.on('data', (data) => {
            stdErrData += data;
        });
        process.on('error', (err) => {
            this.emit('error', new Error(`Process spawn error. Is java in the path?\n${err.message}`));
        });
        process.stdin.on('error', (err) => {
            this.emit('error', new Error(`Error writing to stdin of the compiler.\n${err.message}`));
        });
        const closed = new Promise((resolve) => {
            process.on('close', resolve);
        });
        const stdOutEnded = new Promise((resolve) => {
            process.stdout.on('end', () => { resolve(); });
        });
        const stdErrEnded = new Promise((resolve) => {
            process.stderr.on('end', () => { resolve(); });
        });
        const [code] = await Promise.all([closed, stdOutEnded, stdErrEnded]);
        if (stdErrData.trim().length > 0) {
            log.warn(stdErrData);
        }
        if (code !== 0) {
            this.emit('error', new Error(`Compilation error from ${this.jarPath}`));
            return;
        }
        stdOutData = stdOutData.trim();
        if (typeof this.postCompilationHook === 'function') {
            stdOutData = await this.postCompilationHook(stdOutData);
        }
        if (stdOutData.length > 0) {
            return new Vinyl({
                path: this.outPath,
                contents: new Buffer(stdOutData)
            });
        }
    }
}
exports.default = CompilerStream;
