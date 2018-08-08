/**
 * Type declarations to call soyutils functions from TS to be closure compiled.
 * 
 * Currently this only contains limited declarations that are being used.
 * @todo Use clutz https://github.com/angular/clutz to generate `.d.ts` from
 * soyutils_usegoog.js.
 */

declare module 'goog:soydata.VERY_UNSAFE' {
    namespace soydata.VERY_UNSAFE {
        export function ordainSanitizedHtml(str:string):any
        export function ordainSanitizedJs(str:string):any
        export function ordainSanitizedJsStrChars(str:string):any
        export function ordainSanitizedUri(str:string):any
        export function ordainSanitizedHtmlAttribute(str:string):any
        export function ordainSanitizedCss(str:string):any
    }
    export default soydata.VERY_UNSAFE;
}
