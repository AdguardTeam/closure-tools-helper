/**
 * @fileoverview It spawn a java process with provided arguments, and pipes stdout to
 * a stream that can be used with gulp plugins.
 * This is based on gulp plugin of google-closure-compiler package.
 */

import Vinyl = require('vinyl');
import log = require('fancy-log');
import { spawn } from 'child_process';
import { Stream } from 'stream';

type TPostCompilationHook = (stdout:string) => Promise<string>

export default class CompilerStream extends Stream.Transform {

    constructor(
        private jarPath,
        private args:string[],
        private outPath:string = 'dummy',
        private postCompilationHook?:TPostCompilationHook
    ) {
        super({ objectMode: true });
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
                if (file) { this.push(file); }
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
            let stdInStream = new Stream.Readable({
                read: function() {
                    return new Vinyl();
                }
            });
            stdInStream.pipe(this);
            stdInStream.push(null);
        });
        this.resume();
        return this;
    }

    private async doCompilation():Promise<Vinyl> {
        const process = spawn('java', ['-jar', this.jarPath,  ...this.args]);

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
            process.stdout.on('end', () => { resolve() });
        });
        const stdErrEnded = new Promise((resolve) => {
            process.stderr.on('end', () => { resolve() });
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
