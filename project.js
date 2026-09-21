import {DEFAULT_DOCUMENT} from './document.js';
export const createProject=()=>({version:3,document:DEFAULT_DOCUMENT});
export function restoreProject(value) {
 if(value?.version!==3||typeof value.document!=='string'||value.document.length>250000)throw Error('This is not a Live Strudel document. Old project formats are no longer supported.');
 return {version:3,document:value.document};
}
