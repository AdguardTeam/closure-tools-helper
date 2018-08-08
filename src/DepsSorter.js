"use strict";
/**
 * @fileoverview Contains a class that can be used to retreive dependencies information to be used
 * for `--module` options in closure compiler.
 *
 * This is made to work with tsickle output, i.e. only works with `goog.module` and `goog.require`.
 * (Currently) This does not work with `goog.provide` style modules and goog.module.get(...) style
 * import.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fsExtra = require("fs-extra");
const esprima = require("esprima");
const estraverse = require("estraverse");
const fg = require("fast-glob");
const log = require("fancy-log");
class SourceNode {
    constructor(fileName) {
        this.fileName = fileName;
        this.provides = [];
        this.required = new Set();
        this.forwardDeclared = new Set();
    }
    async populateDeps() {
        let source = this.fileName;
        // Reads the file.
        const content = (await fsExtra.readFile(source)).toString();
        const ast = esprima.parse(content);
        // Lookup top-level `goog.require` and `goog.forwardDeclare` calls, populate `required`, `forwardDeclared` Sets.
        estraverse.traverse(ast, {
            enter: this.onSourceAstNode.bind(this)
        });
        if (this.provides.length === 0) {
            this.invalidSourceError();
        }
        return this;
    }
    onSourceAstNode(node) {
        switch (node.type) {
            case "BlockStatement":
                // Only top-levels
                return estraverse.VisitorOption.Skip;
            case "CallExpression":
                if (node.callee.type === "MemberExpression") {
                    let callee = node.callee;
                    if (callee.object.name === 'goog') {
                        if (!node.arguments[0]) {
                            return;
                        }
                        let moduleName = node.arguments[0].value;
                        switch (callee.property.name) {
                            case 'require': {
                                if (this.forwardDeclared.has(moduleName)) {
                                    this.forwardDeclared.delete(moduleName);
                                }
                                this.required.add(moduleName);
                                break;
                            }
                            case 'forwardDeclare': {
                                if (!this.required.has(moduleName)) {
                                    this.forwardDeclared.add(moduleName);
                                }
                                break;
                            }
                            case 'module':
                            case 'provide': {
                                this.provides.push(moduleName);
                                break;
                            }
                        }
                    }
                }
        }
    }
    invalidSourceError() {
        throw new Error(`${this.fileName} is an invalid source!`);
    }
    // Read-only iterators
    get requiredIter() {
        return this.required.values();
    }
    get forwardDeclaredIter() {
        return this.forwardDeclared.values();
    }
}
class DepsSorter {
    constructor(globs, useClosureDeps) {
        this.globs = globs;
        this.useClosureDeps = useClosureDeps;
        this.fileNameToNode = new Map();
        this.moduleNameToNode = new Map();
        this.forwardDeclared = new Set();
        this.required = new Set();
    }
    addSourceNode(sourceNode) {
        this.fileNameToNode.set(sourceNode.fileName, sourceNode);
        for (let provided of sourceNode.provides) {
            this.moduleNameToNode.set(provided, sourceNode);
        }
    }
    /**
     * Loads closure library dependency information from `closure_library_deps.json`,
     * to avoid reading and parsing all the closure library files every time.
     */
    async fromClosureDeps() {
        const json = await fsExtra.readJSON(DepsSorter.CLOSURE_LIBRARY_DEPS_PATH);
        for (let fileName in json) {
            if (json.hasOwnProperty(fileName)) {
                let data = json[fileName];
                this.addSourceNode({
                    fileName,
                    provides: data.provides,
                    requiredIter: new Set(data.requires).values(),
                    forwardDeclaredIter: new Set(data.forwardDeclares).values()
                });
            }
        }
    }
    static async distillClosureDeps() {
        const sorter = new DepsSorter([
            'node_modules/google-closure-library/closure/goog/**/*.js',
            'node_modules/google-closure-library/third_party/closure/goog/**/*.js',
            '!**/*_test.js'
        ], false);
        await sorter.prepare();
        const json = {};
        // For closure library, `base.js` is required even if it does not `provide`s anything.
        // we register a hypothetical module name `goog._base` and add it to every module.
        for (let [fileName, node] of sorter.fileNameToNode) {
            json[fileName] = {
                provides: node.provides,
                requires: ['goog._base', ...node.requiredIter],
                forwardDeclares: [...node.forwardDeclaredIter]
            };
        }
        json['node_modules/google-closure-library/closure/goog/base.js'] = {
            provides: ['goog._base'],
            requires: [],
            forwardDeclares: []
        };
        await fsExtra.writeJSON(DepsSorter.CLOSURE_LIBRARY_DEPS_PATH, json);
    }
    getFileName(moduleName) {
        let node = this.moduleNameToNode.get(moduleName);
        if (!node) {
            log(`node does not exist for a moduleName ${moduleName}`);
            return;
        }
        return node.fileName;
    }
    getSourceNode(moduleName) {
        let sourceNode = this.moduleNameToNode.get(moduleName);
        if (!sourceNode) {
            throw new Error(`Module name ${moduleName} was not provided in source glob`);
        }
        else {
            return sourceNode;
        }
    }
    *getReferencedNode(node) {
        if (typeof node === 'string') {
            node = this.getSourceNode(node);
        }
        yield node;
        for (let forwardDeclared of node.forwardDeclaredIter) {
            let fwdNode = this.getSourceNode(forwardDeclared);
            if (!this.required.has(fwdNode)) {
                this.forwardDeclared.add(fwdNode);
            }
        }
        for (let required of node.requiredIter) {
            let reqNode = this.getSourceNode(required);
            if (this.forwardDeclared.has(reqNode)) {
                this.forwardDeclared.delete(reqNode);
            }
            if (this.required.has(reqNode)) {
                continue;
            }
            this.required.add(reqNode);
            yield* this.getReferencedNode(reqNode);
        }
    }
    async prepare() {
        this.useClosureDeps && await this.fromClosureDeps();
        let fileNames = await fg(this.globs);
        await Promise.all(fileNames.map(async (fileName) => {
            try {
                this.addSourceNode(await new SourceNode(fileName).populateDeps());
            }
            catch (e) {
                log(`Skipping ${fileName}, for ${e.toString()}`);
            }
        }));
    }
    static getFileName(sourceNode) {
        return sourceNode.fileName;
    }
    getDeps(entryPoints) {
        let out = entryPoints.map(entryPoint => {
            let deps;
            if (entryPoint.moduleId === null) {
                deps = [];
            }
            else {
                deps = [...this.getReferencedNode(entryPoint.moduleId)].map(DepsSorter.getFileName);
            }
            deps.push(...entryPoint.extraSources);
            return deps;
        });
        let forwardDeclaredFileNames = [...this.forwardDeclared].map(DepsSorter.getFileName);
        // prepend modules which are only forwardDeclare'd to the very first module.
        out[0] = [...forwardDeclaredFileNames, ...out[0]];
        return out;
    }
}
DepsSorter.CLOSURE_LIBRARY_DEPS_PATH = path.resolve(__dirname, 'closure_library_deps.json');
exports.default = DepsSorter;
