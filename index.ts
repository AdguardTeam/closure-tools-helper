import closureCompiler = require('google-closure-compiler');
import CompilerStream from './src/CompilerStream';
import TemplatesRuntimeI18nTransformer from './src/TemplatesRuntimeI18nTransformer';
import path = require('path');
import insert = require('gulp-insert');
import gulp = require('gulp');
import fg = require('fast-glob');
import fsExtra = require('fs-extra');

/**************************************************************************************************/

const Compiler = {
    TEMPLATES: './third-party/closure-templates/SoyToJsSrcCompiler.jar',
    STYLESHEETS: './third-party/closure-stylesheets/closure-stylesheets.jar',
    MSG_EXTRACTOR: './third-party/closure-templates/SoyMsgExtractor.jar'
};

for (let key in Compiler) {
    if (Compiler.hasOwnProperty(key)) {
        Compiler[key] = path.resolve(__dirname, Compiler[key]);
    }
}

/**************************************************************************************************/

interface ITemplatesI18nOptions {
    /**
     * This is a string to replace `goog.getMsg` with.
     */
    googGetMsg:string
    /**
     * This is a string that will be appended right after the `goog.module(..)` expression.
     */
    header?:string
    /**
     * This must match files generated by the compiler jar.
     */
    inputGlob:string|string[]
    outputPath?:string // If provided, files will be written to `outputPath/fileName`.
}

/**
 * @param args Command line flags to be passed to the compiler
 * @param options An optional argument that provides necessary data to post-process
 *     compiled soy templates to enable runtime i18n.
 */
export function templates(args:string[], i18nOptions?:ITemplatesI18nOptions):CompilerStream {
    const enableRuntimeI18n = i18nOptions ? async (stdout:string) => {
        let { transform } = new TemplatesRuntimeI18nTransformer(i18nOptions.googGetMsg, i18nOptions.header)

        let fileNames = await fg(i18nOptions.inputGlob);

        await Promise.all(fileNames.map(async (fileName:string) => {
            let parsedPath = path.parse(fileName);

            let content = (await fsExtra.readFile(fileName)).toString();
            content = transform(content);

            let dest = i18nOptions.outputPath ? path.resolve(i18nOptions.outputPath, parsedPath.name + parsedPath.ext) : fileName;

            await fsExtra.writeFile(dest, content);
        }));

        return stdout;
    } : undefined;

    return new CompilerStream(Compiler.TEMPLATES, args, undefined, enableRuntimeI18n);
}

/**************************************************************************************************/

/**
 * @param args command line flags to be passed to the compiler
 * @param outPath The stdout stream will be treated as a stream having this path.
 */
export function stylesheets(args:string[], outPath?:string):CompilerStream {
    return new CompilerStream(Compiler.STYLESHEETS, args, outPath);
}

/**************************************************************************************************/

/**
 * @param args command line flags to be passed to the compiler
 */
export function extractTemplateMsg(args:string[]):CompilerStream {
    return new CompilerStream(Compiler.MSG_EXTRACTOR, args);
}

/**************************************************************************************************/

import DepsSorter from './src/DepsSorter';

interface ICompilerEntryPoint {
    /**
     * This is what is used in `goog.require()`.
     * `null` means there is no entry module. Closure compiler can still move some codes
     * into such modules.
     */
    id:string|null,
    /**
     * module name, used in specifying dependencies, and also used in output file name.
     */
    name:string,
    /**
     * Array of module names that this bundle depends on.
     */
    deps:string[],
    /**
     * Any files that are not reachable via `goog.require`s but still need to be provided
     * to the compiler.
     */
    extraSources?:string[]
}

const ccGulpPlugin = closureCompiler.gulp({});

export async function compiler(baseArgs:string[], sourceGlob:string|string[], entryPoints:ICompilerEntryPoint[]) {
    const sorter = new DepsSorter(sourceGlob, true);

    await sorter.prepare();

    let deps = sorter.getDeps(
        entryPoints.map(
            entryPoint => ({
                moduleId: entryPoint.id,
                extraSources: entryPoint.extraSources || []
            })
        )
    );

    let depsFlag = deps.map((depsOfAModule, index) => {
        let entryPoint = entryPoints[index];
        return [
            '--module', `${entryPoint.name}:${depsOfAModule.length}:${(entryPoint.deps || []).join(':')}`,
            ...riffle('--js', depsOfAModule)
        ]
    });

    return ccGulpPlugin([
        ...baseArgs,
        ...flatten(depsFlag)
    ]);
}

/**************************************************************************************************/

function riffle<T>(x:T, array:T[]):T[] {
    let out:T[] = [];
    for (let i = 0, l = array.length; i < l; i++) {
        out.push(x, array[i]);
    }
    return out;
}

function flatten<T>(array:T[][]):T[] {
    let out:T[] = [];
    for (let i = 0, l = array.length; i < l; i++) {
        out.push(...array[i]);
    }
    return out;
}

/**************************************************************************************************/
/**************************************************************************************************/
