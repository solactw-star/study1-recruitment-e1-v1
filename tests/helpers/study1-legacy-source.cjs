'use strict';
/** Historical Unified/Team simulation sources, never part of formal E1 GAS. */
const path=require('node:path');
const legacy=new Set(['Study1Unified.js','Study1Unified.html','Study1Team.html','Study1FixtureAdapter.js']);
function legacySourcePath(gasRoot,filename){
 const name=String(filename);
 return legacy.has(name)
  ?path.join(__dirname,'../fixtures/legacy-gas',name)
  :path.join(gasRoot,name);
}
module.exports={legacySourcePath,legacy};
