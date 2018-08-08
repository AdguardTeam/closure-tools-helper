"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const closureCompiler = require("google-closure-compiler");
const CompilerStream_1 = require("./src/CompilerStream");
const TemplatesRuntimeI18nTransformer_1 = require("./src/TemplatesRuntimeI18nTransformer");
const path = require("path");
const fg = require("fast-glob");
const fsExtra = require("fs-extra");
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
/**
 * @param args Command line flags to be passed to the compiler
 * @param options An optional argument that provides necessary data to post-process
 *     compiled soy templates to enable runtime i18n.
 */
function templates(args, i18nOptions) {
    const enableRuntimeI18n = i18nOptions ? async (stdout) => {
        let { transform } = new TemplatesRuntimeI18nTransformer_1.default(i18nOptions.googGetMsg, i18nOptions.header);
        let fileNames = await fg(i18nOptions.inputGlob);
        await Promise.all(fileNames.map(async (fileName) => {
            let parsedPath = path.parse(fileName);
            let content = (await fsExtra.readFile(fileName)).toString();
            content = transform(content);
            let dest = i18nOptions.outputPath ? path.resolve(i18nOptions.outputPath, parsedPath.name + parsedPath.ext) : fileName;
            await fsExtra.writeFile(dest, content);
        }));
        return stdout;
    } : undefined;
    return new CompilerStream_1.default(Compiler.TEMPLATES, args, undefined, enableRuntimeI18n);
}
exports.templates = templates;
/**************************************************************************************************/
/**
 * @param args command line flags to be passed to the compiler
 * @param outPath The stdout stream will be treated as a stream having this path.
 */
function stylesheets(args, outPath) {
    return new CompilerStream_1.default(Compiler.STYLESHEETS, args, outPath);
}
exports.stylesheets = stylesheets;
/**************************************************************************************************/
/**
 * @param args command line flags to be passed to the compiler
 */
function extractTemplateMsg(args) {
    return new CompilerStream_1.default(Compiler.MSG_EXTRACTOR, args);
}
exports.extractTemplateMsg = extractTemplateMsg;
/**************************************************************************************************/
const DepsSorter_1 = require("./src/DepsSorter");
const ccGulpPlugin = closureCompiler.gulp({});
async function compiler(baseArgs, sourceGlob, entryPoints) {
    const sorter = new DepsSorter_1.default(sourceGlob, true);
    await sorter.prepare();
    let deps = sorter.getDeps(entryPoints.map(entryPoint => ({
        moduleId: entryPoint.id,
        extraSources: entryPoint.extraSources || []
    })));
    let depsFlag = deps.map((depsOfAModule, index) => {
        let entryPoint = entryPoints[index];
        return [
            '--module', `${entryPoint.name}:${depsOfAModule.length}:${(entryPoint.deps || []).join(':')}`,
            ...riffle('--js', depsOfAModule)
        ];
    });
    return ccGulpPlugin([
        ...baseArgs,
        ...flatten(depsFlag)
    ]);
}
exports.compiler = compiler;
/**************************************************************************************************/
function riffle(x, array) {
    let out = [];
    for (let i = 0, l = array.length; i < l; i++) {
        out.push(x, array[i]);
    }
    return out;
}
function flatten(array) {
    let out = [];
    for (let i = 0, l = array.length; i < l; i++) {
        out.push(...array[i]);
    }
    return out;
}
/**************************************************************************************************/
/**************************************************************************************************/
