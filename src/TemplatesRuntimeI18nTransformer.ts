export default class TemplatesRuntimeI18nTransformer {
    constructor(
        private getMsgNamespace:string,
        private prelude:string = ''
    ) {
        this.transform = this.transform.bind(this);
    }

    private static reGoogProvide = /goog\.provide\('(.*)'\)/;
    private static reGetMsg = /goog\.getMsg\(\s*'\s*(\w+)(?:\{\$\w*\})*'\s*(,|\))/g;

    private transformGetMsgCall = (match, c1, c2) => {
        return `${this.getMsgNamespace}\('${c1}'${c2}`;
    }

    public transform(content:string):string {
        let templateNS:string;
        /**
         * Transform 1: Replace legacy goog.provide statement to goog.module statement
         * and append prelude right after it.
         */
        content = content.replace(TemplatesRuntimeI18nTransformer.reGoogProvide, (_, c1) => {
            templateNS = c1;
            return `goog.module('${templateNS}');\n${this.prelude}`;
        });
        /**
         * Transform 2: Change property declaration on template namespaces into
         * property declaration over `exports`.
         * @todo Use JS abstract syntax tree instead of string replace.
         */
        content = content.replace(new RegExp(`${templateNS}\\.`, 'gm'), `exports.`);
        /**
         * Transform 3: Replace `goog.getMsg` calls into custom call that provides
         * runtime internationalization.
         */
        content = content.replace(TemplatesRuntimeI18nTransformer.reGetMsg, (match, c1, c2) => {
            return `${this.getMsgNamespace}\('${c1}'${c2}`;
        });
        return content;
    }
}
